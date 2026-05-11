# Tax Architecture Roadmap

Status: design direction, not yet implemented.

This document describes the intended direction for supporting multiple tax
jurisdictions in the Retirement Income Planner. It separates the near-term
rule-pack work from later architectural changes needed for structurally
different tax regimes.

## 1. Design Goal

The app should support adding and updating tax jurisdictions/tax years without
requiring changes to core projection logic.

The strategic objective is:

```text
Add or update supported tax jurisdictions through versioned tax rule packs,
metadata, worked examples, and tests — not by scattering jurisdiction-specific
branches through the projection engine.
```

The app should support tax jurisdictions that differ structurally, not just by
rates and bands, but the projection engine should remain jurisdiction-neutral
wherever practical.

The design should:

- keep the projection engine as jurisdiction-neutral as practical;
- support simple data-driven tax packs where possible;
- allow explicitly supported first-party tax modules where simple data is not
  expressive enough;
- version rules by jurisdiction and tax year;
- make applied tax rules explainable to advisers and informed users;
- make it obvious to future developers whether they should add a tax pack,
  extend the tax module, or change projection logic;
- preserve current projection behaviour unless a change is intentional.

Tax packs are **not** intended to be arbitrary plugins. A plugin system would
imply loading free-form executable logic, which is harder to test, review, and
trust in a financial planning tool. Tax packs should instead be structured,
reviewable rule definitions using calculation patterns explicitly supported by
the app.

## 2. Core Principle

The projection engine should describe what happened. The tax module should
decide how it is taxed.

In other words:

```text
Projection engine emits income events.
Tax module calculates tax for those events.
Tax module returns standard results and explanations.
```

The engine should avoid hard-coding jurisdiction-specific concepts where a tax
module can decide them from income categories and user profile data.

## 3. Income Event Model

A future tax interface should receive structured income events rather than only
a single taxable-income number.

Example shape:

```ts
interface IncomeEvent {
  date: string;              // YYYY-MM
  taxYear: string;
  category:
    | 'state_pension'
    | 'defined_benefit_pension'
    | 'dc_pension_drawdown'
    | 'dc_pension_tax_free'
    | 'tax_free_account_withdrawal'
    | 'other_income';
  source: string;
  grossAmount: number;
  taxableAmount: number;
  taxFreeAmount: number;
  currency: string;
}
```

This allows a jurisdiction module to distinguish between income sources even
when the final tax result is calculated annually.

## 4. Tax Module Interface

Every tax module should expose a standard interface.

Illustrative shape:

```ts
interface TaxRuleModule {
  metadata: TaxRuleMetadata;
  calculate(input: TaxCalculationInput): TaxCalculationResult;
}

interface TaxCalculationInput {
  person: PersonTaxProfile;
  taxYear: string;
  residencyPeriods: ResidencyPeriod[];
  incomeEvents: IncomeEvent[];
  options?: Record<string, unknown>;
}

interface TaxCalculationResult {
  totalTax: number;
  taxableIncome: number;
  netIncome: number;
  breakdown: TaxBreakdownItem[];
  warnings: string[];
  assumptions: string[];
  explanation: string[];
}
```

The input and output are standard. The internal calculation can be simple data
tables or jurisdiction-specific code.

## 5. Self-Documentation Requirements

Tax modules should be self-describing. A financial adviser or informed user
should be able to inspect which rules were applied and when they were last
checked.

Each module should provide:

- unique rule id;
- jurisdiction code and label;
- tax year;
- currency;
- effective dates;
- module version;
- last checked date;
- official source references;
- rule summary;
- supported income categories;
- known exclusions;
- adviser review status;
- worked examples or test references.

Illustrative metadata:

```ts
interface TaxRuleMetadata {
  id: string;
  jurisdiction: string;
  jurisdictionLabel: string;
  taxYear: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  version: string;
  lastChecked: string;
  sources: SourceReference[];
  ruleSummary: string[];
  supportedIncomeCategories: string[];
  knownExclusions: string[];
  adviserReviewStatus: 'draft' | 'reviewed' | 'approved' | 'deprecated';
}
```

## 6. Tax Pack Types

The preferred path is to express a jurisdiction/tax-year as a structured,
versioned tax pack: rule data, metadata, source links, known exclusions, worked
examples, and tests.

When a jurisdiction cannot be represented by existing pack fields, the next step
is to add an explicit first-party tax-module capability to the app. It is not to
put jurisdiction-specific branches in the projection engine, and it is not to
load arbitrary plugin code.

The app should support more than one tax-module implementation style over time.

### Simple Banded Pack

Useful for jurisdictions or simplified models that can be represented by:

- personal allowance;
- allowance taper;
- bands;
- rates;
- optional cap.

This is close to the current implementation.

### Code-Driven First-Party Tax Module

Needed where rules cannot be represented cleanly as a small table. This should
still be a reviewed module inside the app's tax layer, with a standard interface,
metadata, worked examples, and tests. It should not be an arbitrary external
plugin and should not leak jurisdiction-specific logic into `projection.ts`.

Examples:

- filing status;
- state/province/local tax;
- married or joint assessment rules;
- age-related allowances;
- pension-specific rules;
- social insurance;
- split-year or residency rules.

### Composite Module

Needed where one person's tax result combines multiple tax authorities.

Examples:

- US federal plus state;
- Canada federal plus province;
- jurisdictions with local surcharges.

## 7. Compatibility Strategy

The current tax engine and rule packs should become the baseline for migration.

For each migrated pack, compare old and new outputs for equivalent rules:

- custom simple tax config;
- UK England/Wales/Northern Ireland;
- UK Scotland;
- Isle of Man;
- mixed guaranteed income, DC drawdown, and tax-free withdrawals;
- high-income allowance taper cases.

Compare:

- taxable income;
- personal allowance used;
- band breakdown;
- total tax;
- net income achieved;
- remaining capital;
- shortfall age;
- depletion events.

Expected result:

- equivalent rules should match within rounding;
- intentional differences must be documented and linked to adviser/spec
  decisions.

## 8. Rule Versioning

Tax rules should be versioned by jurisdiction and tax year.

Example ids:

```text
GB-EWNI-2026-27
GB-SCT-2026-27
IM-2026-27
```

Future years should be added as new modules or data files rather than changing
old results silently. This helps old projections remain reproducible.

Each pack should record:

- source URLs;
- checked date;
- effective date range;
- known exclusions;
- adviser review status.

## 9. Staleness And Review Warnings

The app should warn when a selected tax pack may be stale.

Example warnings:

```text
This tax rule pack was last checked on 2026-05-05. Please verify current tax
rules before relying on projections.
```

```text
This rule pack is marked draft and has not been adviser-reviewed.
```

Staleness thresholds should be configurable, but a useful default is to warn
when a pack is more than 12 months past `lastChecked` or when a projection uses
a tax year without a matching pack.

## 10. Residency Timeline Direction

The current model should remain single-jurisdiction until the tax interface is
stable.

Later, support a residency timeline:

```ts
taxResidency: [
  { from: '2026-04', to: '2030-06', rulePackId: 'IM-2026-27' },
  { from: '2030-07', to: null, rulePackId: 'GB-EWNI-2030-31' },
]
```

Design questions before implementation:

- Should residency be modelled monthly or by tax year?
- How should split tax years be handled?
- Are treaty rules explicitly out of scope?
- Should the app show a warning for any mid-year jurisdiction move?
- Should adviser review be required before enabling this for users?

Recommended first implementation:

- single jurisdiction for the whole projection;
- clear UI and documentation;
- no residency transitions.

Recommended later implementation:

- planned jurisdiction changes by month;
- simplified split-year treatment;
- strong warnings that treaty and residency advice are not modelled unless a
  specific module implements them.

## 11. Self-Documentation In The App

Future app views should expose tax-rule details.

Useful surfaces:

- Dashboard or Review page tax summary;
- Year workings modal;
- adviser review/export document;
- tax pack details panel.

Each should show:

- selected jurisdiction;
- tax year;
- last checked date;
- official source links;
- rule summary;
- known exclusions;
- calculation breakdown for the selected year.

## 12. Roadmap

### Now

- Keep current rule packs.
- Maintain adviser review pack.
- Maintain Isle of Man worked examples in `docs/isle-of-man-worked-examples.md`.
- Improve tax source/version display in Review and year workings.
- Add stale-pack warnings.
- Keep current app calculations as baseline comparison data.

### Later

- Introduce a formal `TaxRuleModule` interface.
- Wrap current banded tax logic as a simple module implementation.
- Convert current UK and Isle of Man packs to first-class modules.
- Add a developer-facing tax-pack creation/update workflow before broadening jurisdictions.
- Add compatibility tests comparing old and new tax outputs.
- Start passing income events into tax calculation.
- Add tax explanation output for adviser review.

### Much Later

- Add residency timeline support.
- Add code-driven complex jurisdiction modules.
- Add composite modules such as US federal plus state or Canada federal plus
  province.
- Add adviser-approved rule-pack status.
- Add annual review workflow for tax packs.

### Optional Future Direction

- Explore external tax-rule engines or datasets.
- Support import/export of reviewed rule packs.
- Allow third-party jurisdiction modules if governance and review processes are
  strong enough.
- Add signed/versioned rule packs if the app is used publicly.

## 13. Open Design Questions

- What minimum metadata should be required before a tax pack can be selected in
  the UI?
- Should draft packs be hidden behind an advanced option?
- Should the app permit custom user tax bands alongside official rule packs?
- How much tax explanation should be visible to normal users versus advisers?
- Should a projection lock the tax pack version used when the config is saved?
- How should future tax years be handled when official rates are not yet known?
