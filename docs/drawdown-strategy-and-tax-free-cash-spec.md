# Drawdown Strategy And Tax-Free Cash Specification

Status: draft for adviser/user review.

This document specifies the intended model for retirement drawdown strategy, source allocation, and pension tax-free cash treatment in the Retirement Income Planner. It is deliberately separate from implementation details so it can be reviewed before changing the projection engine.

The goal is to make a critical design area explicit, testable, and adviser-reviewable before adding blended or hybrid drawdown behaviour.

## Scope

This specification covers:

- how the app distinguishes spending strategy from source allocation;
- how sequential, blended, and hybrid withdrawals should be represented;
- how target-led and portfolio-driven strategies interact with source allocation;
- how pension tax-free cash assumptions should be modelled;
- what the app should show in workings and adviser-facing explanations;
- what should remain out of scope until adviser validation.

This specification does not attempt to provide regulated advice or define a universally optimal retirement drawdown order. It defines the app's modelling primitives and transparency requirements.

## Core design principle

The app should keep three concerns separate:

1. Spending strategy: how much income or withdrawal is requested.
2. Source allocation: which pots/accounts fund that requested withdrawal.
3. Pension tax-free cash treatment: how pension withdrawals are split between tax-free and taxable amounts.

These must not be collapsed into a single opaque "drawdown strategy" setting.

Recommended user-facing summary:

> The income strategy decides how much to draw. The drawdown order/blend decides where it comes from. Pension tax-free cash settings decide how much of pension withdrawals are taxable.

## Current implementation baseline

Current app behaviour:

- `drawdown_strategy` selects the spending strategy.
- `withdrawal_priority` is a simple ordered list of DC pension pots and tax-free accounts.
- Sources are consumed sequentially according to `withdrawal_priority`.
- DC pension withdrawals are split pro-rata using each pot's `tax_free_portion`.
- ISA/tax-free account withdrawals are treated as tax-free.
- The app does not yet support blended or grouped source allocation.
- The app does not yet model upfront pension tax-free lump sums, crystallisation status, or Lump Sum Allowance tracking.

This baseline must remain migration-compatible.

## Spending strategy

The spending strategy answers:

> How much income or withdrawal should the plan try to generate this year?

Existing examples:

- Fixed Target
- Vanguard Dynamic Spending
- Guyton-Klinger Guardrails
- Fixed Percentage
- ARVA
- ARVA + Guardrails

### Target-led strategies

Target-led strategies try to fund a configured income target or target-like amount.

For target-led strategies:

- the configured target is a binding withdrawal objective;
- source allocation should attempt to fund that objective;
- shortfall should be measured against the target;
- UI labels can use "Target income".

Examples:

- Fixed Target
- Vanguard Dynamic Spending
- Guyton-Klinger Guardrails

### Portfolio-driven strategies

Portfolio-driven strategies calculate withdrawals from portfolio value and strategy rules rather than trying to meet the user's configured target income.

For portfolio-driven strategies:

- the strategy-calculated withdrawal is the binding withdrawal request;
- the configured target income is only a planning benchmark/reference line;
- shortfall/adequacy should be described as comparison against the benchmark, not failure to follow the strategy;
- UI labels should use terms such as "Planning benchmark" and "Strategy-calculated income".

Examples:

- Fixed Percentage
- ARVA
- ARVA + Guardrails

Source allocation still applies to portfolio-driven strategies. It decides which pots fund the strategy-calculated withdrawal.

## Source allocation strategy

The source allocation strategy answers:

> Which pots/accounts should fund the requested withdrawal?

This is separate from the spending strategy.

### Design direction: drawdown stages

The preferred future model is an ordered list of drawdown stages.

Each stage contains one or more funding sources. Within a stage, each source has a target percentage share.

Example:

```text
Stage 1
- ISA: 100%

Stage 2
- DC Pension 1: 50%
- DC Pension 2: 50%

Stage 3
- DC Pension 3: 100%
```

The engine works stages left-to-right:

1. Use the active stage to fund the requested withdrawal.
2. Inside the active stage, allocate withdrawals according to the configured percentages.
3. If one source cannot satisfy its share, rebalance that stage's remaining requested withdrawal across the still-available sources in the same stage.
4. If the stage can no longer provide meaningful funding, move to the next stage.
5. If all stages are depleted or unavailable, record a shortfall or reduced income outcome depending on the spending strategy.

### Backward compatibility

Existing `withdrawal_priority` maps naturally into drawdown stages:

```text
withdrawal_priority: ["ISA", "DC Pension", "Cash ISA"]
```

becomes:

```text
Stage 1: ISA 100%
Stage 2: DC Pension 100%
Stage 3: Cash ISA 100%
```

This means existing saved configs can be migrated without changing their projection behaviour.

### Sequential allocation

Sequential allocation is represented as one source per stage.

Example:

```text
Stage 1: Tax-free account 100%
Stage 2: DC Pension 1 100%
Stage 3: DC Pension 2 100%
```

This is simple, transparent, and matches the current engine model.

### Blended allocation

Blended allocation is represented as multiple sources in the same stage.

Example:

```text
Stage 1
- ISA: 40%
- DC Pension: 60%
```

For a target-led strategy, the blend funds the requested target-led withdrawal.

For a portfolio-driven strategy, the blend funds the strategy-calculated withdrawal.

A blend is not a separate income target. It is a rule for sourcing the withdrawal amount.

### Hybrid allocation

Hybrid allocation combines sequential and blended stages.

Example:

```text
Stage 1
- DC Pension 1: 50%
- DC Pension 2: 50%

Stage 2
- ISA: 100%

Stage 3
- DC Pension 3: 100%
```

This is expected to cover many adviser-style approaches without adding a black-box optimiser.

### Rebalancing after depletion

If a stage has three sources at 33.33% each and one source is depleted, the remaining requested withdrawal should be rebalanced across the two available sources in that stage.

Example:

```text
Original stage:
- Pot A: 33.33%
- Pot B: 33.33%
- Pot C: 33.34%

After Pot A is depleted:
- Pot B: 50%
- Pot C: 50%
```

The workings should show both the requested split and the actual split.

## Gross-up and tax interaction

Source allocation cannot be treated as a purely net-income split because sources have different tax treatments.

Examples:

- ISA withdrawals are tax-free.
- DC pension withdrawals may be partly tax-free and partly taxable.
- Different pension pots may have different tax-free portions or future tax-free cash treatment.

For target-led strategies, the engine must gross up taxable withdrawals sufficiently to try to meet the net target, subject to available balances and tax rules.

For blended stages, this means the engine may need to iterate or calculate source-specific gross withdrawals so that the resulting net income is close to the requested net amount while respecting the source allocation rule.

Specification principle:

- The configured blend expresses the intended gross funding shares unless a later design deliberately chooses net-share semantics.
- The UI must explain that different tax treatments mean the net contribution from each source may not match the gross withdrawal percentage exactly.
- If adviser review favours net-share semantics, this document should be updated before implementation.

Open adviser question:

> Should blended percentages represent gross withdrawals from each source, or intended net income contribution after tax?

Initial recommendation:

- Use gross withdrawal shares because they are easier to explain, easier to audit, and align with pot-balance depletion.
- Show the net result clearly in workings.

## Pension tax-free cash treatment

Pension tax-free cash treatment answers:

> For a DC pension pot, how is the available tax-free element used?

This is per DC pot and should remain separate from both spending strategy and source allocation.

### Current default: gradual pro-rata tax-free cash

Current behaviour treats each DC pension withdrawal as partly tax-free and partly taxable according to the pot's configured tax-free portion.

Example:

```text
DC pot tax-free portion: 25%
Gross withdrawal: £10,000
Tax-free portion: £2,500
Taxable pension income: £7,500
```

This is the preferred default for now because it is simple and transparent.

Recommended adviser-facing wording:

> The current model uses a simplified pro-rata assumption: if a pension pot is configured as 25% tax-free, each withdrawal from that pot is treated as 25% tax-free and 75% taxable. This is an approximation and does not yet model all crystallisation or lump-sum options.

### Future per-pot TFC treatment options

A future model may add an explicit per-pot tax-free cash treatment setting.

Candidate options:

1. Gradual with withdrawals
   - Current default.
   - Tax-free amount is taken pro-rata with each withdrawal.

2. Take tax-free lump sum upfront
   - A configured amount or percentage of the available tax-free entitlement is removed from the pension pot at a specified event date, usually retirement/crystallisation date.
   - The remaining pension pot is more taxable thereafter.
   - The app must separately specify where the lump sum goes.

3. Already taken / no tax-free cash remaining
   - Future withdrawals from that pot are treated as taxable pension income.

Potential later extension:

- Partial upfront lump sum plus residual gradual treatment.

Example:

```text
Take 10% of pot as upfront tax-free cash.
Remaining tax-free entitlement is used gradually with future withdrawals.
```

Front-loading tax-free cash within normal monthly withdrawals is deliberately out of scope for the first implementation unless adviser review makes it a priority.

### Lump sum destination

If upfront tax-free cash is modelled, the app must not silently assume it is spent.

Possible destination choices:

- Outside plan / spent or held externally.
- Added to a tax-free account inside the plan, if allowance and modelling assumptions permit.
- Added to a cash-like planning account inside the plan.

This is a material modelling decision and needs explicit UI and workings.

## Workings and transparency requirements

Any implementation of drawdown stages or expanded TFC treatment must update workings so users/advisers can audit results.

At minimum, workings should show:

- selected spending strategy;
- whether the strategy is target-led or portfolio-driven;
- requested annual/monthly withdrawal or income;
- planning benchmark where relevant;
- active drawdown stage;
- configured source split for that stage;
- actual source split after depletion/rebalancing;
- gross withdrawal by source;
- tax-free amount by source;
- taxable amount by source;
- tax calculation summary;
- net income achieved;
- shortfall or benchmark gap;
- depletion events and stage transitions;
- any upfront tax-free cash events.

The Year Workings modal and any adviser-facing export should use the same underlying data rather than recalculating independently.

## Suggested config shape

This is illustrative only and should be refined during implementation planning.

```ts
interface DrawdownStageConfig {
  id: string;
  name?: string;
  sources: DrawdownStageSourceConfig[];
}

interface DrawdownStageSourceConfig {
  source_type: 'dc_pot' | 'tax_free_account';
  source_name: string;
  target_share: number; // percentage or decimal; implementation must choose one
}

interface DCPotTaxFreeCashConfig {
  mode: 'gradual_pro_rata' | 'upfront_lump_sum' | 'already_taken';
  upfront_amount?: number;
  upfront_percentage_of_pot?: number;
  event_date?: string; // YYYY-MM
  destination?: 'outside_plan' | 'tax_free_account' | 'cash_account';
  residual_mode?: 'gradual_pro_rata' | 'none';
}
```

Migration rule:

- If `drawdown_stages` is missing, derive it from `withdrawal_priority` as one 100% source per stage.
- If per-pot TFC treatment is missing, treat the pot as `gradual_pro_rata` using the existing `tax_free_portion`.

## Validation rules

Suggested validation rules:

- A drawdown stage must contain at least one source.
- A source must refer to an existing DC pot or tax-free account.
- Within a stage, configured source shares should sum to 100% for normal saved configs.
- The UI may temporarily allow non-100% totals while editing, but must warn clearly.
- Duplicate source entries inside a single stage should be normalised or rejected.
- A source may appear in more than one stage only if the intended semantics are explicitly defined. Initial recommendation: reject duplicates across stages to avoid confusing behaviour.
- TFC upfront amount/percentage must not exceed available tax-free entitlement under the app's simplified assumptions.
- If a TFC lump sum has a destination inside the plan, the destination must be explicit and included in workings.

## UI principles

The UI should avoid presenting this as one overloaded advanced setting.

Recommended structure:

1. Income strategy
   - How much to draw.
   - Existing strategy selector.
   - Strategy-sensitive labels: Target income vs Planning benchmark.

2. Drawdown order and blending
   - Which pots/accounts fund withdrawals.
   - Ordered stages UI.
   - Single-source stage appears as simple sequential order.
   - Multi-source stage appears as a blend.

3. Pension tax-free cash
   - Per DC pot.
   - Default: gradual pro-rata.
   - More advanced options hidden or clearly marked until adviser-reviewed.

Recommended wording for a stage:

> Use these sources together. If one runs out, the remaining sources in this stage are rebalanced before moving to the next stage.

Recommended wording for current simple TFC default:

> Tax-free cash is spread across withdrawals from this pension. For example, with 25% tax-free cash, each £1,000 withdrawal is treated as £250 tax-free and £750 taxable.

## Adviser review questions

1. Is the separation between spending strategy, source allocation, and pension tax-free cash clear and useful?
2. For blended stages, should percentages represent gross withdrawal shares or intended net income contribution after tax?
3. Is one-source-per-stage plus multi-source blended stages sufficient for common client cases?
4. Should the first implementation reject the same source appearing in multiple stages?
5. Is gradual pro-rata pension tax-free cash an acceptable default approximation at this stage?
6. Which upfront tax-free lump-sum cases are important enough to model in the first version, if any?
7. Should tax-aware optimisation remain a later optional feature rather than part of the initial blended drawdown model?
8. What caveat wording would be appropriate for adviser/client use?

## Out of scope for first implementation

The following should not be included in the first blended/staged drawdown implementation unless explicitly reprioritised:

- black-box tax-aware optimisation;
- automatic recommendation of the best drawdown order;
- full pension crystallisation ledger;
- Lump Sum Allowance tracking;
- UFPLS/PCLS terminology-heavy UI;
- front-loaded monthly tax-free cash sequencing;
- estate-planning optimisation;
- provider-specific pension rules;
- fund-specific tax or withdrawal constraints.

These may be added later as explicit, adviser-reviewed features.

## Testing expectations

Implementation should be test-first.

Core regression tests should cover:

- legacy `withdrawal_priority` migration to one-source stages;
- sequential stages matching current projection output exactly;
- simple two-source blend with tax-free account and DC pension;
- blend rebalancing after one source depletes;
- stage transition after all sources in a stage deplete;
- target-led strategy funding a net target;
- portfolio-driven strategy funding a strategy-calculated withdrawal;
- per-pot gradual pro-rata TFC matching current behaviour;
- workings data showing requested split vs actual split;
- validation of invalid/duplicate/missing sources.

Compatibility rule:

- Existing saved configs without drawdown-stage or TFC-treatment fields must continue to project as they do today.

## Implementation phasing

Suggested phases:

1. Specification and adviser review
   - Review this document.
   - Resolve gross-share vs net-share semantics for blended percentages.
   - Confirm first-version TFC scope.

2. Data model and migration
   - Add drawdown-stage config types.
   - Derive stages from existing `withdrawal_priority`.
   - Preserve current output for sequential cases.

3. Engine support for stages
   - Implement one-source stages first.
   - Add multi-source gross-share blending.
   - Add depletion rebalancing and stage transitions.

4. Workings and UI transparency
   - Surface active stage, requested split, actual split, tax, and shortfall/benchmark gap.
   - Keep target-led vs portfolio-driven wording consistent.

5. Optional per-pot TFC treatment expansion
   - Keep gradual pro-rata as default.
   - Add upfront lump-sum only if adviser/user review confirms scope.

6. Later optimisation work
   - Add explicit optimiser-suggested stage structures only after the manual staged model is trusted.
   - Clearly distinguish user-authored rules from optimiser suggestions.
