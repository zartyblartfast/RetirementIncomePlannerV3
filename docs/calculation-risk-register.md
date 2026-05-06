# Calculation Risk Register

This register records calculation risks found during assurance review. It links
each risk to a recommended decision and verification path.

Status labels:

- Fix now: likely to affect user trust or calculation correctness.
- Specify then test: behaviour needs a clear rule before code changes.
- Adviser review: financial/tax treatment needs external confirmation.
- Documentation/UI: wording or explanation needs correction.

## R1: Mixed DC Pot Tax-Free Portions

Status: Addressed.

Area:
- Net-income gross-up for DC withdrawals.

Previous behaviour:
- The engine calculated a weighted-average tax-free portion across all positive
  DC balances.
- It then used that single gross-per-net ratio while withdrawing from individual
  pots in priority order.

Current behaviour:
- The engine calculates DC gross-up source by source using the tax-free portion
  of the pot being drawn.

Why this matters:
- If all DC pots have the same tax-free portion, this is harmless.
- If pots differ, the engine can withdraw the wrong gross amount to meet the
  target net income.
- This can materially affect projected income, tax, depletion timing, and
  remaining capital.

Evidence:
- `docs/calculation-worked-examples.md`, Example 5.
- `src/engine/__tests__/workedExamples.test.ts` covers this case.

Recommended decision:
- Calculate DC gross-up source-by-source using the actual tax-free portion of
  the pot being drawn, not a portfolio-wide weighted average.

Verification:
- Example 5 was converted from `it.todo` into an executable test.
- Source-by-source gross-up was implemented.
- Example 5 passes.
- Review any golden output changes deliberately.

## R2: Generic Tax Model

Status: In progress.

Area:
- Income tax calculation.

Current behaviour:
- Tax can be configured manually with a personal allowance plus banded rates.
- Initial rule packs exist for UK England/Wales/Northern Ireland 2026-27 and
  UK Scotland 2026-27.
- The first rule packs include personal allowance tapering but do not model
  every jurisdiction-specific rule.

Why this matters:
- The app may be used for important retirement decisions.
- A generic model can be internally consistent while still omitting rules that
  matter in a user's tax jurisdiction.

Recommended decision:
- Keep the generic tax model if the app is explicitly a configurable planning
  model.
- Add adviser-approved examples for the intended jurisdiction before presenting
  tax outputs as reliable.

Verification:
- `src/engine/__tests__/tax.test.ts` covers the initial rule packs and the UK
  personal allowance taper.
- Add more jurisdiction-specific worked examples after rules are confirmed.
- Document exclusions clearly in the app and adviser pack.

## R3: Fixed Target Annual Display Versus Monthly CPI Target

Status: Addressed.

Area:
- Fixed target income display and shortfall calculation.

Previous behaviour:
- `target_net` was based on the starting monthly target multiplied by 12.
- Shortfall used the sum of monthly targets, after monthly CPI increments.

Current behaviour:
- `target_net` is the sum of the 12 monthly targets used by the engine for
  that projection year.

Why this matters:
- Users may compare `target_net` to `net_income_achieved` and see apparent
  over-target results.
- The engine may be mathematically consistent but confusing.

Recommended decision:
- Display the sum of monthly targets, because that is what shortfall uses.

Verification:
- Example 8 documents a fixed target with monthly CPI increments.
- `src/engine/__tests__/workedExamples.test.ts` covers the annual target
  display.
- Golden fixtures and cross-check expectations have been reviewed and updated.

## R4: Guaranteed Income Starts Or Stops Mid-Year

Status: Addressed.

Area:
- Strategy setup and gross-up estimates.

Previous behaviour:
- At year setup, active guaranteed income was annualised as the current monthly
  amount times 12.
- Month-by-month actual guaranteed income was still accumulated during the year.

Current behaviour:
- Year setup estimates guaranteed income by counting the actual projected
  active months in the projection year.
- Month-by-month actual guaranteed income is still accumulated during the year.

Why this matters:
- If guaranteed income starts or stops mid-year, annual estimates may diverge
  from actual income in that projection year.
- This can affect strategy targets, gross-up, and apparent shortfalls.

Recommended decision:
- Decide that fixed-target funding should be calculated month-by-month from
  actual monthly income.
- For portfolio-driven strategies, specify whether guaranteed-income estimates
  should use actual projected months in the year rather than annualised current
  month.

Verification:
- Example 7 covers guaranteed income starting mid-year.
- `src/engine/__tests__/workedExamples.test.ts` verifies a `pot_net` strategy
  counts only active guaranteed-income months.
- Golden fixtures and the V1 diagnostic comparison were reviewed and updated
  for the intentional divergence from V1 behaviour.

## R5: Verification Panel Overclaims Trust

Status: Addressed.

Area:
- User-facing confidence language.

Previous behaviour:
- The panel says internal identities hold and "the numbers can be trusted."

Current behaviour:
- The panel is labelled "Internal consistency checks".
- Expanded wording says checks prove only internal arithmetic consistency
  against the configured model and assumptions.

Why this matters:
- Internal consistency does not prove real-world correctness.
- This is especially sensitive because users may make important financial
  decisions based on the projection.

Recommended decision:
- Reword to say internal consistency checks passed.
- Make clear that figures match the configured model and assumptions.

Verification:
- UI text now uses "Internal consistency checks" language.
- Expanded wording says passing checks mean the projection balances internally
  against the configured model and assumptions.
- Expanded wording says checks do not prove the model is complete,
  jurisdiction-correct, or suitable as financial advice.
- Confirm screenshots/app wording no longer overclaims.
- Link or refer to calculation assumptions in adviser-facing docs.

## R6: Pot Depletion Month And Residual Cleardown

Status: Addressed.

Area:
- Depletion reporting and small residual balances.

Current behaviour:
- Withdrawals are monthly, after monthly growth and fees.
- A source is depleted when its balance reaches zero after withdrawal and
  residual cleardown.
- Residual balances below `50` are swept into income and closed.

Why this matters:
- Users need depletion events to match the projection timeline.
- Leaving small residual amounts in pots can make plans look artificially
  active or leave confusing balances.

Recommended decision:
- Keep residual cleardown explicit and tested.
- Record depletion in the projection month where the source is closed.

Verification:
- Example 9 covers a `5049` DC pot against a `12000` annual target.
- `src/engine/__tests__/workedExamples.test.ts` verifies the residual `49` is
  swept in month 5, the pot closes to zero, and the depletion event is recorded
  at age 65 month 5.

## Recommended Order

1. Progress R2 with adviser-approved examples.
