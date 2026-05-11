# Test Coverage Review

This document classifies the current automated tests by the kind of confidence
they provide. It is written for two audiences:

- advisers, who need to understand what assurance the software process gives;
- developers, who need to trace model rules back to tests and code.

The central distinction is:

> Automated tests provide engineering assurance that the app consistently applies
> the documented model. Adviser review is still needed to validate whether that
> documented model, its assumptions, exclusions, and tax treatment are
> appropriate for planning use.

## Current Recorded Baseline

Latest recorded local Dev01 verification after adding the internal consistency
suite:

- 244 Vitest tests passing.
- TypeScript check passing with `npx tsc -b`.
- Production build passing with `npm run build`, with the existing chunk-size
  warning only.
- Internal consistency addition committed locally as `8e2dfa9 test: add internal
  consistency checks`.

This baseline should be re-run before any adviser pack is finalised or shared.

## Adviser-Facing Assurance Summary

The test suite is intended to show that the app is not merely producing plausible
numbers. It checks that displayed figures, chart figures, annual projection rows,
monthly simulation rows, tax breakdowns, and worked examples reconcile back to
the same documented model.

The tests can increase confidence that:

- the software applies the configured assumptions consistently;
- monthly calculations reconcile to annual displayed results;
- chart and table values are derived from the projection engine rather than
  independent duplicated logic;
- important edge cases are guarded against accidental regression;
- hand-checkable worked examples remain aligned with the implementation.

The tests do not prove that:

- the tax model is complete for every real-world circumstance;
- pension provider rules, crystallisation status, or client-specific constraints
  have all been captured;
- investment assumptions are suitable for a specific person;
- the app constitutes regulated advice.

## Assurance Layers

| Layer | Evidence | What it gives confidence in | What still needs review |
| --- | --- | --- | --- |
| Written model | `docs/calculation-spec.md`, `docs/calculation-assumptions.md`, `docs/tax-rule-packs.md` | The model is explicit rather than hidden in code. | Whether the stated rules and exclusions are acceptable. |
| Worked examples | `docs/calculation-worked-examples.md`, `docs/isle-of-man-worked-examples.md` | Small scenarios can be checked by hand or spreadsheet. | Whether more real-world examples are needed. |
| Automated tests | `src/**/__tests__/*` | The implementation continues to match the documented model and examples. | Whether the model itself is domain-complete. |
| UI transparency | Year workings, review page, verification panel, chart reconciliation | Users can trace outputs back to assumptions and source fields. | Whether the presentation is clear enough for non-specialists. |
| Adviser checklist | `docs/adviser-review-checklist.md` | Review decisions and caveats are captured systematically. | Adviser judgement on planning suitability. |

## Test Categories

| Test file | Category | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `src/engine/__tests__/workedExamples.test.ts` | Domain correctness / generic worked examples | Small examples from `docs/calculation-worked-examples.md` match expected hand-checkable results, including mixed tax-free DC pots, fixed-target CPI display, mid-year guaranteed income, and depletion residual cleardown. | Does not cover every pension/tax product feature or client-specific case. |
| `src/engine/__tests__/iomWorkedExamples.test.ts` | Domain correctness / Isle of Man worked examples | Isle of Man 2026-27 below-allowance, standard-rate, higher-rate, allowance-taper, and optional tax-cap examples match the documented worked examples. | Still needs adviser confirmation that the selected rule scope is appropriate for the intended planning use. |
| `src/engine/__tests__/internalConsistency.test.ts` | Monthly/annual and UI reconciliation | Monthly rows reconcile to annual `YearRow` outputs; guaranteed-income active months are respected; residual depletion is recorded; annual rows, table fields, and income chart data reconcile. | Does not prove the underlying assumptions are complete or suitable. |
| `src/components/dashboard/__tests__/chartData.test.ts` | Chart-data reconciliation | Dashboard income chart data is built from the same engine fields used in annual rows, including gross drawdown and negative tax bars. | Does not visually inspect chart rendering in the browser. |
| `src/engine/__tests__/sanityChecks.test.ts` | Internal arithmetic consistency | Sanity report checks catch income identity, tax band total, pot P&L, non-negative balance, and summary consistency concepts. | Internal consistency is not the same as real-world correctness. |
| `src/engine/__tests__/workings.test.ts` | Transparency consistency | Workings reports are produced and key cross-check deltas are small. | Does not prove formulas are the right formulas. |
| `src/engine/__tests__/tax.test.ts` | Tax unit correctness | Generic banded tax calculator, gross-up solver, rule-pack cases, and personal allowance taper behave as expected for focused examples. | Does not prove any jurisdiction-specific tax regime is complete for all circumstances. |
| `src/engine/__tests__/taxContext.test.ts` | Tax-source visibility | Tax rule-pack context, source metadata, known exclusions, and display summaries are derived for review/workings views. | Does not verify legal accuracy of the sources or assumptions. |
| `src/engine/__tests__/withdrawalPriority.test.ts` | Config robustness | Stale, duplicate, missing, renamed, and imported withdrawal-priority orders are normalised consistently. | Does not decide which drawdown order is financially best. |
| `src/engine/__tests__/optimiser.test.ts` | Drawdown-order regression | Optimiser permutations and metrics reconcile with direct projection results, including mixed DC tax-free portions. | Does not decide whether the optimiser objective matches a client's goals. |
| `src/engine/__tests__/projection.test.ts` | Projection smoke/behaviour tests | Projection runs across strategies, creates rows, respects basic withdrawal order, and detects depletion. | Mostly checks shape and broad behaviour, not exact correctness for every edge case. |
| `src/engine/__tests__/crosscheck.test.ts` | Cross-version regression | TypeScript engine matches selected V1 Python baseline values. | If V1 behaviour was wrong or simplified, this preserves that behaviour. |
| `src/engine/__tests__/golden.test.ts` | Golden regression | Strategy outputs stay stable unless intentionally changed. | Golden snapshots can lock in bugs; changed fixtures must be reviewed, not blindly regenerated. |
| `src/engine/__tests__/diagnostic.test.ts` | Diagnostic/parity | Compares fixture, UI default, and V1-active-style scenarios. | Large diagnostic tests can be hard to interpret as precise domain rules. |
| `src/engine/__tests__/strategies.test.ts` | Strategy unit tests | Strategy dispatch and target calculations work for representative cases. | Does not prove full real-world validity of strategy methodology. |
| `src/engine/__tests__/backtest.test.ts` | Backtest smoke tests | Historical window machinery produces plausible outputs and percentile ordering. | Does not independently validate historical assumptions or future-return suitability. |
| `src/engine/__tests__/growthSuggestions.test.ts` | Growth suggestion unit/range tests | Growth suggestion outputs are monotonic, in expected ranges, and mock data behaves predictably. | Does not prove future returns or suitability of suggested rates. |
| `src/store/__tests__/configStore.test.ts` | Store smoke tests | Basic localStorage presence/reset behaviour works. | Does not cover the full provider first-run state machine. |
| `src/store/__tests__/ConfigProvider.test.tsx` | Store/import workflow | Empty storage starts first-run mode; stored legacy configs are migrated; import-style save plus mark-configured exits first-run mode; reset returns to first-run mode. | File picker/browser import UI still needs manual browser smoke testing. |
| `src/store/__tests__/reviewStore.test.ts` | Review snapshot persistence | Review snapshots and tax context survive expected store operations. | Does not validate adviser interpretation of the snapshot. |

## Current Strengths

- The app now has worked-example tests for generic calculations and Isle of Man
  tax scenarios.
- The new internal consistency tests verify monthly-to-annual reconciliation,
  active-month guaranteed income, residual depletion, and chart/table/engine
  reconciliation.
- Drawdown-order optimisation is checked against direct projection results.
- Config robustness tests guard against stale or imported withdrawal-priority
  orders.
- Tax context tests check that review/workings views expose rule-pack metadata,
  source links, and known exclusions.
- Golden and cross-version tests reduce the risk of accidental behavioural
  changes during refactors.

## Current Gaps

### Domain Correctness Gaps

- Adviser validation is still needed for jurisdiction-specific tax assumptions,
  especially Isle of Man/UK interactions, residency issues, and omitted tax
  categories.
- Product-specific pension rules, crystallisation status, provider limits, and
  individual client constraints are not modelled unless manually represented in
  inputs.
- Investment volatility is not modelled in the normal deterministic projection.

### Test Quality Gaps

- Some tests assert broad plausibility rather than exact expected values.
- Golden tests protect against accidental changes but can preserve wrong
  behaviour if the baseline was wrong.
- Not every test maps cleanly back to a calculation-spec section yet.
- Browser-level visual checks are still separate from the automated unit test
  suite.

### Tooling Gaps

- `npm run lint` currently needs an ESLint 9 flat config before it can be used as
  a regular quality gate.
- Some sandboxed environments can block Vite/esbuild child processes; final
  validation should be done in a normal project terminal.

## Recommended Next Tests

1. Add adviser-approved tax examples after review feedback, especially for any
   Isle of Man/UK edge cases the adviser considers material.
2. Add more explicit calculation-spec cross-references to worked-example and
   internal-consistency tests.
3. Add browser smoke checks or lightweight UI tests for the adviser-facing review
   and workings views once wording stabilises.
4. Add tests for any new caveat, tax-pack, or pension-product rule introduced as
   a result of adviser feedback.

## How To Use This Review

Before changing calculation logic:

1. Update the written calculation spec or assumptions register.
2. Add or update a worked example where practical.
3. Add a focused test that would fail if the rule is broken.
4. Change the engine or UI.
5. Run targeted tests, full Vitest, TypeScript, and build as appropriate.
6. Review any changed golden outputs deliberately.
7. Update this document if the assurance category or known gaps change.
