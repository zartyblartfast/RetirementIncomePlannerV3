# Isle of Man Worked Examples

These examples document the current `IM-2026-27` tax rule pack and provide
plain-English checks for the regression tests in
`src/engine/__tests__/iomWorkedExamples.test.ts`.

They are examples of the app's current banded income-tax model. They are not
personal tax advice.

## Rule Pack Scope

The `IM-2026-27` pack currently models:

- personal allowance of £17,000 for the 2026/27 tax year, commencing
  6 April 2026;
- personal allowance taper above £100,000 at £1 lost for every £2 of
  income above the threshold;
- standard rate: first £6,500 after personal allowance at 10%;
- higher rate: remaining income after personal allowance at 21%;
- optional tax cap amount of £220,000, only when `tax_cap_enabled` is set.

Note on year differences: the Isle of Man Government rates-and-allowances table
shows the single-person allowance as £14,500 for 2022/23 to 2024/25, £14,750
for 2025/26, and £17,000 for 2026/27. This document is deliberately testing the
`IM-2026-27` rule pack, so the £17,000 allowance is not the same as the older
£14,500 figure.

Known exclusions from the current rule pack:

- joint assessment and married/civil-partner allowance rules;
- automatic tax-cap election handling;
- National Insurance, capital gains tax, inheritance tax, residency, and treaty
  rules;
- savings and dividend-specific treatment separate from ordinary income.

Rule pack source references, as recorded in `src/engine/taxRulePacks.ts`:

- Isle of Man Government Income Tax Practice Notes, checked 2026-05-05:
  https://www.gov.im/categories/tax-vat-and-your-money/income-tax-and-national-insurance/tax-practitioners-and-technical-information/practice-notes/
- PwC Worldwide Tax Summaries - Isle of Man Individual taxes, checked 2026-05-05:
  https://taxsummaries.pwc.com/isle-of-man/individual/taxes-on-personal-income

## Examples

### £16,000 Income

Personal allowance is £17,000.

Income after personal allowance is £0, so total tax is £0.

Marginal rate reported by the calculator is 0%.

### £20,000 Income

Personal allowance is £17,000.

Income after personal allowance:

```text
£20,000 - £17,000 = £3,000
```

Tax:

```text
£3,000 at 10% = £300
```

Total tax is £300. Marginal rate reported by the calculator is 10%.

### £50,000 Income

Personal allowance is £17,000.

Income after personal allowance:

```text
£50,000 - £17,000 = £33,000
```

Tax:

```text
£6,500 at 10% = £650
£26,500 at 21% = £5,565
Total = £6,215
```

Total tax is £6,215. Marginal rate reported by the calculator is 21%.

### £110,000 Income

The personal allowance taper starts above £100,000.

Allowance reduction:

```text
(£110,000 - £100,000) * 50% = £5,000
```

Personal allowance:

```text
£17,000 - £5,000 = £12,000
```

Income after personal allowance:

```text
£110,000 - £12,000 = £98,000
```

Tax:

```text
£6,500 at 10% = £650
£91,500 at 21% = £19,215
Total = £19,865
```

Total tax is £19,865. Marginal rate reported by the calculator is 21%.

### £1,100,000 Income With Tax Cap Enabled

This example only applies when the optional tax cap is explicitly enabled.

At this income level, the personal allowance is fully tapered to £0.

Uncapped tax:

```text
£6,500 at 10% = £650
£1,093,500 at 21% = £229,635
Uncapped total = £230,285
```

With `tax_cap_enabled: true` and `tax_cap_amount: 220000`, total tax is capped
to £220,000 and `tax_cap_applied` is true.
