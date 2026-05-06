# Retirement Income Planner - Adviser Review Pack

Status: draft for adviser review.

This pack summarises the calculation model used by the Retirement Income
Planner. It is intended to help an independent financial adviser review whether
the assumptions, tax treatment, and retirement-income mechanics are reasonable
for planning use.

This document does not ask the adviser to review the software code. It asks the
adviser to review the planning model described here, highlight missing rules,
and confirm which assumptions are acceptable or should be changed.

## 1. Purpose Of Review

The app projects retirement income from:

- guaranteed income such as state pension and defined benefit pensions;
- defined contribution pension pots;
- tax-free accounts such as ISAs;
- selected income tax rule packs;
- configurable drawdown strategies and drawdown order.

The review objective is to assess whether the model is suitable as a retirement
income planning tool under clearly stated assumptions.

The review should not treat the app as regulated advice, a product
recommendation engine, or a substitute for personalised financial advice.

## 2. Scope Of The App

The app currently models:

- monthly projection from retirement/anchor date to plan end age;
- deterministic annual growth rates converted to monthly rates;
- DC pension annual fees converted to monthly rates;
- guaranteed income with start/end dates and optional monthly indexation;
- DC pension withdrawals with configurable tax-free portions;
- tax-free account withdrawals;
- annual income tax using selected rule-pack bands or custom tax settings;
- drawdown order permutations across DC pots and tax-free accounts;
- plan shortfall, depletion events, and remaining capital.

## 3. Important Limitations

The app does not currently model:

- investment volatility in the normal projection;
- sequence-of-returns risk except through separate historical/backtest views;
- provider-specific pension rules, charges, crystallisation rules, or drawdown
  limits;
- National Insurance;
- savings tax, dividend tax, or capital gains tax;
- inheritance tax;
- residency changes during the projection;
- tax treaties or split-year residency rules;
- means-tested benefits;
- inflation uncertainty;
- spouse/partner income planning except where manually represented in inputs.

The app should present results as projections under configured assumptions, not
as guaranteed outcomes.

## 4. User Inputs

Core inputs include:

- date of birth;
- retirement date;
- projection end age;
- target net annual income and CPI assumption;
- guaranteed income amounts, dates, taxability, and indexation;
- DC pot balances, growth rates, fees, and tax-free portions;
- tax-free account balances and growth rates;
- selected tax rule pack or custom tax settings;
- drawdown strategy;
- drawdown order.

Retirement date is the source of truth for retirement timing. Retirement age is
derived from date of birth and retirement date.

## 5. Projection Timeline

The engine projects monthly.

The projection anchor is the later of:

- retirement date; and
- the latest `values_as_of` date across income and account values.

If balances are dated before the anchor, they are grown forward to the anchor.
If the anchor is later than retirement, target income is inflated forward from
retirement to the anchor.

Projection rows are displayed annually by whole age, but many calculations are
performed monthly and then aggregated.

## 6. Guaranteed Income Treatment

Guaranteed income may be taxable or non-taxable.

Annual amounts are converted to monthly amounts. Indexation is converted to an
equivalent monthly rate and applied monthly.

Income can start or stop mid-year. The projection counts only the months in
which that income is active.

Adviser review questions:

- Is monthly handling of guaranteed income start/stop dates appropriate?
- Should state pension, defined benefit pensions, or other guaranteed income
  types have different indexation or tax treatment?
- Are there common pension features that should be modelled separately rather
  than as generic guaranteed income?

## 7. DC Pension Withdrawal Treatment

Each DC pot has:

- starting balance;
- annual growth rate;
- annual fee rate;
- configured tax-free portion.

Withdrawals are made monthly according to drawdown order. Growth and fees are
applied before that month's withdrawal.

For DC withdrawals:

- gross withdrawal reduces the pot balance;
- tax-free portion is based on the specific pot being drawn;
- the remaining taxable portion is included in annual taxable income;
- net-income strategies gross-up withdrawals source by source.

Adviser review questions:

- Is using a fixed tax-free portion per pot acceptable for planning purposes?
- Should the app model crystallised/uncrystallised pension status explicitly?
- Should pension commencement lump sum behaviour be modelled differently from
  regular drawdown?
- Are there provider or regulatory constraints that materially affect the
  projection?

## 8. Tax-Free Account Treatment

Tax-free accounts, such as ISAs, are treated as fully tax-free.

Withdrawals from tax-free accounts:

- are not included in taxable income;
- reduce the account balance;
- are included in net income achieved.

Adviser review questions:

- Is the generic tax-free-account treatment adequate for ISAs and similar
  accounts?
- Are any account-specific withdrawal constraints important enough to model?

## 9. Income Tax Treatment

The tax model is an annual banded tax calculator.

Taxable income is:

```text
taxable guaranteed income + taxable part of DC pension withdrawals
```

The app supports:

- custom tax settings;
- tax rule packs for named jurisdictions and tax years;
- personal allowance;
- optional personal allowance taper;
- progressive tax bands;
- optional tax cap setting.

Current rule packs:

- UK England/Wales/Northern Ireland 2026-27;
- UK Scotland 2026-27;
- Isle of Man 2026-27.

Known tax exclusions include National Insurance, savings/dividend tax, capital
gains tax, inheritance tax, residency transitions, treaties, and special
allowances unless explicitly represented.

The longer-term tax architecture is documented separately in
`docs/tax-architecture-roadmap.md`. That roadmap proposes self-documenting tax
modules with source links, rule summaries, known exclusions, and calculation
explanations.

Adviser review questions:

- Is the Isle of Man 2026-27 rule pack correct for resident retirement-income
  planning within the stated scope?
- Are UK pension and state-pension tax treatments represented correctly enough
  for planning?
- Which tax exclusions are likely to materially affect retirement income
  projections?
- Should tax be calculated annually as it is now, or should the model use a
  more detailed tax-year/monthly approach?

## 10. Target Income And CPI

Fixed target income starts from an annual net target.

CPI is converted to a monthly equivalent rate. Monthly targets are inflated
month by month. The displayed annual target for a projection year is the sum of
that year's monthly targets.

Shortfall is assessed against the sum of monthly targets in the projection year.

Adviser review questions:

- Is monthly CPI compounding appropriate?
- Should target income inflation use CPI, a user-selected inflation rate, or
  separate inflation assumptions by expense category?

## 11. Drawdown Strategies

Current strategies include:

- Fixed Target: targets a net income amount, inflated over time.
- Fixed Percentage: withdraws a percentage of portfolio value.
- Vanguard Dynamic: adjusts withdrawals subject to annual caps.
- Guyton-Klinger: adjusts withdrawals using guardrails.
- ARVA: recalculates withdrawal using portfolio value, assumed real return, and
  remaining time to plan end.
- ARVA + Guardrails: ARVA with year-to-year change limits.

Adviser review questions:

- Are these strategy descriptions accurate enough for client-facing planning?
- Which strategies should be shown to non-advised users?
- Are any strategy names or assumptions likely to mislead users?

## 12. Drawdown Order Analysis

The Drawdown Order page compares all permutations of drawable sources:

- DC pots;
- tax-free accounts.

Each order is projected using the same engine. The table reports metrics such
as end capital, total tax, total income, shortfall age, and capital exhausted
age.

Adviser review questions:

- Are the reported comparison metrics the right ones?
- Should the "best" order be ranked by end capital, tax, sustainability, or
  another objective?
- Are there cases where tax efficiency conflicts with other planning goals?

## 13. Depletion And Shortfall Rules

A source is depleted when its balance reaches zero after monthly withdrawal and
residual cleardown.

Residual balances below `50` are swept into income and the source is closed.
This avoids leaving small unusable balances in a projection.

A year is marked as shortfall if net income achieved is materially below the
sum of monthly targets.

Adviser review questions:

- Is the residual cleardown rule acceptable as a practical modelling rule?
- Should shortfall tolerance be lower, higher, or configurable?
- Should depletion be shown by month, age, tax year, or all three?

## 14. Worked Examples

The supporting worked examples cover:

- one DC pot, no tax, no growth;
- guaranteed income only;
- one DC pot with 25% tax-free portion;
- one DC pot with 0% tax-free portion;
- two DC pots with different tax-free portions;
- ISA-only withdrawal;
- guaranteed income starting mid-year;
- CPI disabled versus enabled;
- pot depletion mid-year and residual cleardown.

See `docs/calculation-worked-examples.md`.

Adviser review questions:

- Are these examples sufficient for an initial review?
- Which real-world examples should be added before wider use?
- Should there be separate Isle of Man-specific examples?

## 15. Internal Consistency Checks

The app includes internal consistency checks. These re-derive selected figures
from constituent parts, such as:

- income identity;
- tax band totals;
- pot profit/loss identity;
- non-negative balances;
- shortfall summary consistency.

These checks verify arithmetic consistency inside the configured model. They do
not prove that the financial model is complete, jurisdiction-correct, or
suitable as advice.

## 16. Adviser Decision Checklist

Please mark each item as:

- acceptable for planning;
- acceptable with caveats;
- needs change before use;
- outside review scope.

Checklist:

- Projection timeline and monthly aggregation.
- Growth and fee assumptions.
- Guaranteed income treatment.
- DC pension tax-free portion treatment.
- DC pension taxable drawdown treatment.
- Tax-free account treatment.
- Income tax model and jurisdiction packs.
- Isle of Man rule pack assumptions.
- CPI and target-income treatment.
- Drawdown strategies.
- Drawdown order comparison metrics.
- Depletion and shortfall rules.
- User caveats and non-advice wording.
- Missing high-impact tax, pension, or planning rules.

## 17. Open Items Before Public Reliance

The app is suitable for structured adviser review, but not yet for public
reliance without caveats.

Open items:

- adviser validation of calculation assumptions;
- adviser validation of Isle of Man and UK tax treatment;
- more jurisdiction-specific worked examples;
- clearer source/version display in app review outputs;
- chart/table reconciliation checks;
- imported config robustness;
- final user-facing disclaimer and documentation review.
