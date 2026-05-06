# Calculation Assumptions And Limitations

This register lists modelling assumptions that affect retirement income
projections. Each item should be accepted, changed, or explicitly reviewed with
an adviser.

## Status Labels

- Accepted: deliberate and currently acceptable.
- Needs adviser review: financial/tax treatment should be externally reviewed.
- Needs engineering review: likely code or test improvement required.

## Assumptions

| Area | Assumption | Status |
| --- | --- | --- |
| Growth | Annual growth rates are deterministic and converted to monthly equivalent rates. | Needs adviser review |
| Fees | DC fees are applied monthly as an equivalent monthly rate. | Needs adviser review |
| Volatility | Normal projections use fixed rates and do not model market volatility. | Needs adviser review |
| Tax | Income tax uses a configurable personal allowance plus tax bands. | Needs adviser review |
| Tax timing | Tax is computed annually, while withdrawals are stepped monthly. | Needs adviser review |
| Pension tax-free cash | DC withdrawals use the configured tax-free portion of the specific pot being drawn. | Needs adviser review |
| Guaranteed income | Guaranteed income is modelled as monthly income with optional monthly indexation. | Needs adviser review |
| Mid-year income changes | Guaranteed income start/stop dates are projected monthly; strategy estimates count active months in the projection year. | Needs adviser review |
| CPI | Fixed target income is inflated monthly using an annual-to-monthly CPI rate. | Needs adviser review |
| ISA/tax-free accounts | Withdrawals from tax-free accounts are treated as fully tax-free. | Needs adviser review |
| Product rules | Provider-specific withdrawal limits, crystallisation rules, and charges are not modelled. | Needs adviser review |
| Regulation/advice | The app is a planning tool, not regulated financial advice. | Accepted |

## Current High-Risk Review Items

1. Generic tax bands may not represent the full tax rules for the user's
   jurisdiction.
2. Rule packs are initial defaults and require adviser review before they are
   treated as planning-grade tax assumptions.
3. Product-specific pension rules, crystallisation status, and provider limits
   are not modelled.
4. Residency changes and treaty/split-year rules are not modelled.
5. UI verification language should continue to emphasise internal consistency,
   not complete correctness.
