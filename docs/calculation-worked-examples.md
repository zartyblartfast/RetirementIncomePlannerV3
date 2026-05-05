# Calculation Worked Examples

These examples are deliberately small. They are intended to be checked by hand,
spreadsheet, adviser review, and later automated tests.

Unless stated otherwise:

- Projection starts at retirement.
- Growth is 0%.
- Fees are 0%.
- CPI is 0%.
- Amounts are annual.
- Rounding is to 2 decimal places.

## Example 1: One DC Pot, No Tax, No Growth

Purpose: prove the simplest withdrawal and balance mechanics.

Config:
- Date of birth: `1960-01`
- Retirement date: `2025-01`
- End age: `66`
- Target net income: `12000`
- DC pot: `30000`
- Tax-free portion: irrelevant because tax is zero
- Tax: personal allowance high enough that tax is zero

Expected:

| Year age | Target net | DC gross withdrawal | Tax | Net achieved | Closing DC pot |
| --- | ---: | ---: | ---: | ---: | ---: |
| 65 | 12000.00 | 12000.00 | 0.00 | 12000.00 | 18000.00 |
| 66 | 12000.00 | 12000.00 | 0.00 | 12000.00 | 6000.00 |

Check:
- Closing pot = opening pot - gross withdrawal.
- Net achieved = DC gross - tax.

## Example 2: Guaranteed Income Only, No Tax

Purpose: prove guaranteed income can meet the target without pot withdrawals.

Config:
- Target net income: `12000`
- Guaranteed income: `12000`, non-taxable
- No DC pots
- No tax-free accounts

Expected:

| Target net | Guaranteed income | Pot withdrawals | Tax | Net achieved |
| ---: | ---: | ---: | ---: | ---: |
| 12000.00 | 12000.00 | 0.00 | 0.00 | 12000.00 |

Check:
- No pot withdrawal is needed.
- Net achieved = guaranteed income.

## Example 3: One DC Pot, 25% Tax-Free, Flat 20% Tax

Purpose: prove gross-up for a single DC pot with a tax-free pension portion.

Config:
- Target net income: `12000`
- No guaranteed income
- One DC pot
- Tax-free portion: `25%`
- Personal allowance: `0`
- Tax rate: flat `20%`

Formula:

```text
taxable portion = gross * 75%
tax = taxable portion * 20% = gross * 15%
net = gross - tax = gross * 85%
gross needed = 12000 / 0.85 = 14117.65
```

Expected:

| DC gross withdrawal | Tax-free portion | Taxable portion | Tax | Net achieved |
| ---: | ---: | ---: | ---: | ---: |
| 14117.65 | 3529.41 | 10588.24 | 2117.65 | 12000.00 |

## Example 4: One DC Pot, 0% Tax-Free, Flat 20% Tax

Purpose: prove gross-up when the whole DC withdrawal is taxable.

Config:
- Target net income: `12000`
- No guaranteed income
- One DC pot
- Tax-free portion: `0%`
- Personal allowance: `0`
- Tax rate: flat `20%`

Formula:

```text
tax = gross * 20%
net = gross * 80%
gross needed = 12000 / 0.80 = 15000.00
```

Expected:

| DC gross withdrawal | Tax-free portion | Taxable portion | Tax | Net achieved |
| ---: | ---: | ---: | ---: | ---: |
| 15000.00 | 0.00 | 15000.00 | 3000.00 | 12000.00 |

## Example 5: Two DC Pots With Different Tax-Free Portions

Purpose: expose whether gross-up is applied using the actual source being drawn
or a weighted average across all DC pots.

Config:
- Target net income: `12000`
- No guaranteed income
- Personal allowance: `0`
- Tax rate: flat `20%`
- Withdrawal order:
  1. Pot A
  2. Pot B
- Pot A balance: `6000`, tax-free portion `0%`
- Pot B balance: sufficient, tax-free portion `25%`

Expected source-by-source calculation:

Pot A:

```text
gross withdrawn = 6000.00
tax = 6000.00 * 20% = 1200.00
net from Pot A = 4800.00
remaining net needed = 12000.00 - 4800.00 = 7200.00
```

Pot B:

```text
net rate = 85%
gross needed = 7200.00 / 0.85 = 8470.59
tax-free portion = 8470.59 * 25% = 2117.65
taxable portion = 6352.94
tax = 1270.59
net from Pot B = 7200.00
```

Expected total:

| Source | Gross withdrawal | Tax-free portion | Taxable portion | Tax | Net |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pot A | 6000.00 | 0.00 | 6000.00 | 1200.00 | 4800.00 |
| Pot B | 8470.59 | 2117.65 | 6352.94 | 1270.59 | 7200.00 |
| Total | 14470.59 | 2117.65 | 12352.94 | 2470.59 | 12000.00 |

This example verifies that the engine calculates gross-up against the pot
actually being withdrawn, rather than using a weighted-average tax-free portion
across all DC pots.

## Example 6: ISA-Only Withdrawal

Purpose: prove tax-free account withdrawals are not taxed.

Config:
- Target net income: `12000`
- No guaranteed income
- No DC pots
- ISA balance: `20000`
- Tax rate: any, because ISA withdrawal is tax-free

Expected:

| ISA withdrawal | Tax | Net achieved | Closing ISA |
| ---: | ---: | ---: | ---: |
| 12000.00 | 0.00 | 12000.00 | 8000.00 |

## Example 7: Guaranteed Income Starts Mid-Year

Purpose: define expected behaviour when guaranteed income is active for only
part of a projection year.

Config:
- Retirement date: `2025-01`
- End age: `66`
- Drawdown strategy: ARVA
- Strategy portfolio net income target: `12000`
- Guaranteed income: `6000` per year, starts `2025-07`
- One DC pot: `24000`
- No tax and no growth

Expected:

| Year | Strategy pot income | Guaranteed income | Target net | DC withdrawal | Net achieved |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025 | 12000.00 | 3000.00 | 15000.00 | 12000.00 | 15000.00 |

Check:
- The guaranteed income contributes only six active months: July to December.
- Strategy setup counts the actual projected guaranteed income months in the
  year, not the year-start active amount annualised for all 12 months.
- Monthly funding still uses actual monthly guaranteed income.

## Example 8: CPI Disabled Versus Enabled

Purpose: make target inflation explicit.

Config A:
- Target net income: `12000`
- CPI: `0%`

Expected:
- Year 1 target = `12000`
- Year 2 target = `12000`

Config B:
- Target net income: `12000`
- CPI: annual `12.6825%`, which is equivalent to `1%` monthly

Expected monthly target:

```text
month 1 = 1000.00
month 2 = 1010.00
month 3 = 1020.10
...
```

Open question:
- Annual `target_net` should show the sum of the 12 monthly inflated targets,
  because that is what shortfall is assessed against.
- With a 1% monthly CPI equivalent and starting monthly target of `1000`, year 1
  annual target should be:

```text
1000.00 + 1010.00 + 1020.10 + ... + 1115.67 = 12682.50
```

## Example 9: Pot Depletion Mid-Year

Purpose: prove shortfall, depletion month, and residual cleardown behaviour.

Config:
- Target net income: `12000`
- No tax
- No growth
- One DC pot: `5049`

Expected:
- The monthly target is `1000`.
- The first four months withdraw `1000` each.
- The fifth month withdraws `1000`, then sweeps the remaining residual `49`.
- The pot can fund only `5049` of the `12000` annual target.
- Closing pot = `0`.
- Net achieved = `5049`.
- Shortfall = true.
- A depletion event is recorded at age `65`, month `5`.
- The month 5 detail shows the pot depleted and a closing balance of `0`.
