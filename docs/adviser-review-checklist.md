# Adviser Review Checklist

Status: draft review aid.

This checklist is the export-friendly companion to `docs/adviser-review-pack.md`.
It is intended to make an independent adviser review easier by separating the
review actions from the longer explanatory pack.

The review is about the planning model and assumptions. It is not a request to
review the source code, provide regulated advice through the app, or approve the
software as a financial product.

## 1. Suggested Review Order

1. Read `docs/adviser-demo-guide.md` for the suggested live walkthrough.
2. Read `docs/adviser-review-pack.md` for the model overview.
3. Skim `docs/calculation-spec.md` for the detailed calculation rules.
4. Review `docs/calculation-assumptions.md` for explicit simplifications and
   assumptions.
5. Review `docs/calculation-worked-examples.md` for generic calculation
   examples.
6. Review `docs/isle-of-man-worked-examples.md` for Isle of Man 2026-27 tax
   examples.
7. Review `docs/tax-rule-packs.md` for implemented tax-rule-pack scope and
   exclusions.
8. Review `docs/test-coverage-review.md` if you want a high-level map of the
   current automated test coverage.
9. Record decisions and caveats in the checklist below.

## 2. Related Documents

| Document | Purpose |
| --- | --- |
| `docs/adviser-demo-guide.md` | Short live-demo path and wording guardrails for showing the app to an adviser. |
| `docs/adviser-review-pack.md` | Adviser-facing summary of model scope, mechanics, review questions, and open items. |
| `docs/calculation-spec.md` | Detailed plain-English calculation rules. |
| `docs/calculation-assumptions.md` | Explicit assumptions, simplifications, and exclusions. |
| `docs/calculation-worked-examples.md` | Generic hand-checkable calculation examples. |
| `docs/isle-of-man-worked-examples.md` | Isle of Man 2026-27 tax worked examples. |
| `docs/tax-rule-packs.md` | Tax-rule-pack scope, source policy, and current exclusions. |
| `docs/test-coverage-review.md` | Adviser-facing calculation-assurance and automated test coverage map. |

## 3. Decision Labels

For each area, please mark one of:

- Acceptable for planning.
- Acceptable with caveats.
- Needs change before use.
- Outside review scope.

Where possible, please add the reason, any caveat wording that should be shown
to users, and whether the issue is high, medium, or low priority.

## 4. Calculation Model Checklist

| Area | Decision | Caveats / required changes | Priority |
| --- | --- | --- | --- |
| Projection timeline and monthly aggregation |  |  |  |
| Values-as-of anchoring and pre-retirement growth |  |  |  |
| Annual growth assumptions and monthly compounding |  |  |  |
| Annual fee assumptions and monthly application |  |  |  |
| Guaranteed income start/stop dates |  |  |  |
| Guaranteed income taxability and indexation |  |  |  |
| Target income and CPI treatment |  |  |  |
| Fixed Target drawdown strategy |  |  |  |
| Fixed Percentage drawdown strategy |  |  |  |
| Vanguard Dynamic drawdown strategy |  |  |  |
| Guyton-Klinger drawdown strategy |  |  |  |
| ARVA drawdown strategy |  |  |  |
| ARVA + Guardrails strategy |  |  |  |
| Source depletion and residual cleardown |  |  |  |
| Shortfall definition and tolerance |  |  |  |

## 5. Pension And Account Treatment Checklist

| Area | Decision | Caveats / required changes | Priority |
| --- | --- | --- | --- |
| DC pension withdrawal mechanics |  |  |  |
| Fixed tax-free portion per DC pot |  |  |  |
| Gross-up for net-income target strategies |  |  |  |
| Multiple DC pots with different tax-free portions |  |  |  |
| Crystallised/uncrystallised pension status omitted |  |  |  |
| Provider-specific rules and charges omitted |  |  |  |
| Tax-free account / ISA withdrawal treatment |  |  |  |
| Drawdown order comparison metrics |  |  |  |
| Ranking drawdown orders by end capital / tax / sustainability |  |  |  |

## 6. Tax Rule Pack Checklist

| Area | Decision | Caveats / required changes | Priority |
| --- | --- | --- | --- |
| UK England/Wales/Northern Ireland 2026-27 pack |  |  |  |
| UK Scotland 2026-27 pack |  |  |  |
| Isle of Man 2026-27 pack |  |  |  |
| Personal allowance and taper handling |  |  |  |
| Progressive band calculation |  |  |  |
| Optional Isle of Man tax-cap handling |  |  |  |
| UK pension and State Pension tax treatment within stated scope |  |  |  |
| National Insurance omitted |  |  |  |
| Savings/dividend tax omitted |  |  |  |
| Capital gains tax omitted |  |  |  |
| Inheritance tax omitted |  |  |  |
| Residency changes, treaties, and split-year rules omitted |  |  |  |
| Joint assessment / spouse planning omitted except manual inputs |  |  |  |

## 7. Worked Example Checklist

Please confirm whether the examples are sufficient to validate the intended
model mechanics, or note additional cases that should be added.

| Example set | Decision | Additional cases requested |
| --- | --- | --- |
| Generic calculation worked examples |  |  |
| Isle of Man below-allowance example |  |  |
| Isle of Man standard-rate-band example |  |  |
| Isle of Man higher-rate-band example |  |  |
| Isle of Man allowance-taper example |  |  |
| Isle of Man optional tax-cap example |  |  |
| Mid-year guaranteed income example |  |  |
| Depletion and residual cleardown example |  |  |
| CPI target example |  |  |
| Drawdown-order / source-order examples |  |  |

## 8. Calculation Assurance Checklist

Please confirm whether the test coverage summary gives enough engineering
assurance for adviser review, and note any additional examples or checks that
would make the model easier to validate.

| Area | Decision | Additional assurance requested |
| --- | --- | --- |
| Written-model to worked-example to automated-test trail |  |  |
| Monthly-to-annual reconciliation checks |  |  |
| Chart/table/engine reconciliation checks |  |  |
| Tax-band and tax-context checks |  |  |
| Isle of Man worked-example test coverage |  |  |
| Drawdown-order and optimiser reconciliation checks |  |  |
| Config robustness checks for imported/stale data |  |  |
| Wording that tests are engineering assurance, not advice approval |  |  |

## 9. User-Facing Caveats To Confirm

Please mark whether these caveats are adequate or need stronger wording.

| Caveat | Adequate? | Suggested wording |
| --- | --- | --- |
| Projections are not guaranteed outcomes. |  |  |
| The app is not a substitute for personalised financial advice. |  |  |
| The app models configured assumptions, not all tax and pension rules. |  |  |
| Rule packs are scoped to listed income categories and exclusions. |  |  |
| Investment volatility is not modelled in the normal projection. |  |  |
| Tax, pension, and residency rules can change. |  |  |

## 10. Final Adviser Notes

Please provide:

- any assumptions that are acceptable for planning;
- any assumptions that need a caveat but can remain in the model;
- any assumptions or calculations that should change before use;
- any high-impact omitted rules;
- any wording that would make the review pack clearer for non-specialists.

## 11. Review Sign-Off Record

| Field | Response |
| --- | --- |
| Adviser name |  |
| Firm / role |  |
| Date reviewed |  |
| Documents reviewed |  |
| Overall review status |  |
| Key caveats |  |
| Follow-up actions |  |
