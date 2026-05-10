# Calculation Assurance Plan

This plan is for increasing confidence in the retirement income calculations
before adviser review. It separates model specification, worked examples,
tests, code changes, adviser-facing material, and final documentation.

## Current Baseline

- The projection engine is deterministic and month-stepped.
- TypeScript compilation passes with `node_modules\.bin\tsc.cmd -b`.
- Vitest may fail to start in the Codex sandbox because Vite/esbuild child
  process spawning can be blocked with `EPERM`; run tests in a normal terminal
  when validating locally.
- Existing golden tests and V1/V2 cross-checks are regression tests. They are
  useful, but they do not by themselves prove real-world financial correctness.

## Step 1: Freeze Current Behaviour

Goal: record what the engine currently does before changing calculation logic.

Work:
- Run TypeScript, tests, and build where the local environment allows.
- Record any failing checks as environment/tooling issues or genuine defects.
- Treat existing golden outputs as current behaviour snapshots.

Verify:
- TypeScript passes.
- Test/build status is recorded.
- Any changed golden output is reviewed before being accepted.

## Step 2: Maintain A Calculation Spec

Goal: define the intended model in plain English before changing code.

Work:
- Keep `docs/calculation-spec.md` aligned with the engine.
- Make every major calculation rule explicit.
- Distinguish exact rules from simplifications.

Verify:
- Each major projection output has a documented source rule.
- Any adviser challenge can be traced to a spec section.

## Step 3: Maintain An Assumptions Register

Goal: avoid hiding modelling choices inside code.

Work:
- Keep `docs/calculation-assumptions.md` up to date.
- Mark each assumption as accepted, needs adviser review, or needs engineering
  review.

Verify:
- The app does not imply more certainty than the assumptions support.

## Step 4: Build Worked Examples

Goal: create small scenarios that can be checked by hand or spreadsheet.

Initial examples:
- No tax, no growth, one DC pot.
- Guaranteed income only.
- One DC pot with 25% tax-free portion.
- One DC pot with 0% tax-free portion.
- Two DC pots with different tax-free portions.
- ISA-only withdrawals.
- Guaranteed income starts mid-plan.
- Pot depletion mid-year.
- CPI disabled and CPI enabled.

Verify:
- Expected values are calculated outside the engine.
- Each example is small enough for adviser review.

## Step 5: Convert Worked Examples Into Tests

Goal: turn the calculation spec into executable checks.

Work:
- Add focused tests for each worked example.
- Label tests with the spec rule they verify.
- Prefer exact expected values for simple examples.
- Use tolerances only for genuine rounding/compounding cases.

Verify:
- Tests fail when a documented rule is violated.
- Tests read like calculation documentation.

## Step 6: Classify Existing Tests

Goal: understand what confidence each current test gives.

Categories:
- Domain correctness tests.
- Regression/golden tests.
- Cross-version parity tests.
- Arithmetic identity tests.
- Edge-case tests.

Verify:
- Known gaps are listed.
- Tests that only preserve old behaviour are not mistaken for proof of
  correctness.

## Step 7: Investigate High-Risk Calculation Findings

Current high-risk/open items:
- Adviser validation of jurisdiction-specific tax rules.
- Product-specific pension rules, crystallisation status, and provider limits.
- Residency changes and treaty/split-year rules.
- Chart/table reconciliation checks.
- Imported config robustness.

Verify:
- Each item is classified as fix now, document as assumption, ask adviser, or
  defer with a risk note.

## Step 8: Make One Calculation Change At A Time

Goal: keep changes reviewable and auditable.

For each change:
- Update the spec first.
- Add or update a worked example.
- Add a failing test where practical.
- Change the engine.
- Run checks.
- Explain changed projection outputs.

Verify:
- The reason for the change is clear.
- Any changed golden output is intentionally reviewed.

## Step 9: Create An Adviser Review Pack

Goal: make independent review practical.

Contents:
- `docs/adviser-review-pack.md` as the adviser-facing summary.
- `docs/adviser-review-checklist.md` as the short response template.
- Calculation spec.
- Assumptions and exclusions.
- Worked examples.
- Test coverage and calculation-assurance summary.
- Known limitations and open questions.
- Example projection output.

Verify:
- A non-developer can understand the model.
- A developer can trace rules to tests and code.

## Step 10: Update UI Confidence Language

Goal: communicate confidence honestly.

Work:
- Replace wording such as "numbers can be trusted" with "internal consistency
  checks passed" or similar.
- State that projections match the configured model and assumptions.

Verify:
- The UI does not imply financial advice or guaranteed correctness.

## Step 11: Update App Documentation

Goal: keep repo documentation aligned with the model.

Work:
- Update README summaries where needed.
- Keep deployment and calculation docs current.
- Link adviser-facing docs from a clear location.
- Keep the tax architecture roadmap aligned with tax-rule-pack changes.

Verify:
- Documentation, tests, and app wording agree.
