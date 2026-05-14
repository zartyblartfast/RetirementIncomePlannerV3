# Calculation Spec

This document describes the intended calculation model for the retirement income
planner. It is the reference point for tests, adviser review, and future engine
changes.

Status: draft. Some rules document the current implementation and need adviser
review before being treated as final.

## Dates And Ages

- User dates are stored as `YYYY-MM`.
- Retirement date is the source of truth for retirement timing.
- Retirement age is derived from date of birth and retirement date.
- Projection rows are labelled by whole ages.
- The normal projection runs from the projection anchor age through `end_age`,
  inclusive.

## Projection Anchor

- The engine starts at the later of retirement date and the latest `values_as_of`
  date across guaranteed income, DC pots, and tax-free accounts.
- If asset values are dated before the anchor, balances are grown forward to the
  anchor.
- If the anchor is later than retirement, target income is inflated forward from
  retirement to the anchor.

## Growth And Fees

- DC and tax-free account growth rates are annual rates.
- Annual growth is converted to an equivalent monthly rate.
- DC annual fees are converted to an equivalent monthly rate.
- Each month, DC balances receive growth and then fees are deducted.
- Tax-free accounts receive growth but no fee deduction in the current model.
- Negative balances are not intentionally allowed.

## Guaranteed Income

- Guaranteed income can be taxable or non-taxable.
- Income can start and end by date.
- Legacy age-based start/end fields may be normalised to dates.
- Annual guaranteed amounts are converted to monthly amounts.
- Indexation is converted to a monthly rate and applied monthly.
- Strategy estimates count the actual projected guaranteed income months within
  the projection year. They do not annualise the year-start month as if it
  applies for all 12 months.
- For `pot_net` strategies, annual target income equals the strategy's
  portfolio net income target plus the actual projected net guaranteed income
  for that year.

## DC Pension Pots

- DC pots have a balance, annual growth rate, annual fee rate, and tax-free
  portion.
- Withdrawals are made according to `withdrawal_priority`.
- DC withdrawals are split into tax-free and taxable portions using the pot's
  configured tax-free portion.
- DC gross withdrawals reduce pot balances.

- Net-income gross-up uses the tax-free portion of the source being drawn, not
  a weighted average across all DC pots.

## Tax-Free Accounts

- Tax-free accounts, such as ISAs, have a balance and growth rate.
- Withdrawals from these accounts are treated as tax-free income.
- Withdrawals reduce account balances.

## Income Tax

- The current tax model is a configurable banded tax calculator.
- Taxable income is reduced by a personal allowance.
- A tax rule pack can provide jurisdiction and tax-year defaults for the
  personal allowance, allowance taper, and bands.
- Remaining taxable income is taxed through configured bands.
- Tax is calculated annually for each projection year.
- DC taxable income is DC gross withdrawal minus DC tax-free portion.
- Total taxable income is taxable guaranteed income plus DC taxable income.

Open review item:
- Rule packs are initial jurisdiction-specific defaults, not complete tax
  advice. Exclusions must remain visible until adviser review confirms the
  intended scope.

## Target Income And CPI

- Fixed target strategy starts from an annual net income target.
- CPI is converted to a monthly rate.
- For fixed target, the monthly target is inflated monthly.
- The annual `target_net` displayed for a projection year is the sum of that
  year's 12 monthly targets, after monthly CPI timing is applied.
- Shortfall is assessed against the sum of monthly targets in the projection
  year.

## Withdrawal Ordering

See `drawdown-strategy-and-tax-free-cash-spec.md` for the proposed staged
source-allocation model covering sequential, blended, and hybrid drawdown.

Current implementation baseline:

- `withdrawal_priority` controls the order in which DC pots and tax-free
  accounts are used.
- The engine attempts to meet the remaining monthly net target from sources in
  priority order.
- If a source is exhausted, the engine continues to the next source.
- Withdrawals occur monthly after that month's growth and fees have been
  applied.

## Depletion And Shortfall

- A pot or account is depleted when its balance reaches zero after monthly
  withdrawal and residual cleardown.
- A small positive residual balance below `50` is swept into income and the
  source is closed, to avoid leaving unusable residual amounts.
- Depletion events record pot/account name, age, and month in projection year.
- A year is marked as a shortfall if net income achieved is materially below the
  sum of monthly targets.
- A plan is considered sustainable if no shortfall occurs before the relevant
  plan end rule.

## Strategy Rules

### Fixed Target

- Targets a fixed net annual income, inflated over time by CPI.
- The engine gross-ups taxable DC withdrawals where needed to target net income.

### Fixed Percentage

- Withdraws a configured percentage of the current investable portfolio.
- This is treated as a gross pot withdrawal target.

### Vanguard Dynamic

- Starts from an initial target.
- Applies CPI adjustment subject to maximum annual increase/decrease caps.

### Guyton-Klinger

- Starts from an initial target.
- Applies CPI and adjusts income when withdrawal rate crosses configured
  guardrails.

### ARVA

- Recalculates annual withdrawal from portfolio value, assumed real return, and
  remaining months through plan end age.

### ARVA + Guardrails

- Applies ARVA calculation and clamps year-to-year changes using configured
  increase/decrease caps.

## Verification Meaning

Internal verification checks prove arithmetic consistency within the configured
model. They do not prove that the model is complete, jurisdiction-correct, or
appropriate for an individual's financial plan.
