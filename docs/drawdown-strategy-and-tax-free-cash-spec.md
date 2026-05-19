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

Each stage contains one or more funding sources. Within a stage, each source has a target share stored as a decimal (`0.0` to `1.0`) and displayed to users as a percentage.

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
2. Inside the active stage, allocate withdrawals according to the configured shares.
3. If one source cannot satisfy its share, rebalance that stage's remaining requested withdrawal across the still-available sources in the same stage.
4. If the stage can no longer provide meaningful funding under the transition rules below, move to the next stage.
5. If all stages are depleted or unavailable, record a shortfall or reduced income outcome depending on the spending strategy.

### Stage naming

`DrawdownStageConfig.name` is optional for saved data, but workings and UI must always have a display name.

Display-name rule:

- If `name` is present and non-blank, use it.
- Otherwise use `Stage N`, where `N` is the 1-based position after migration/normalisation.

This avoids forcing users to name every stage while keeping workings and audit text readable.

### Stage identity

`DrawdownStageConfig.id` is a stable internal identifier for persistence, React keying, and future stage renaming. It is not user-facing.

Recommended ID rules:

- Newly created stages should use an app-generated stable ID, preferably `stage_${crypto.randomUUID()}` where browser support is available, with a deterministic fallback if needed.
- Migration from legacy `withdrawal_priority` should create deterministic IDs from the migrated order, for example `legacy_stage_1`, `legacy_stage_2`, and so on.
- Import/normalisation must reject duplicate stage IDs or repair them by assigning new stable IDs while preserving the stage order; the repair should be surfaced in validation/import feedback rather than silently changing persisted identity.
- UI display and adviser-facing wording should use the display name rule above, not the internal ID.

### Stage transition rules

A stage remains active while at least one source in that stage can provide funding.

A stage is exhausted and the engine moves to the next stage when all sources in the current stage are unavailable for further withdrawal in the current calculation period. A source is unavailable when:

- its opening/remaining balance for that period is zero or effectively zero after rounding;
- it has reached a source-specific withdrawal limit, if such limits are later added; or
- it is invalid or missing after config normalisation, which should normally be caught before projection.

For the first implementation, "meaningful funding" should not be a vague judgement. Use a small explicit money tolerance only to avoid penny-level loops and rounding noise. Recommended initial tolerance: less than £0.01 available gross withdrawal in the current monthly calculation step.

Monthly/annual boundary rule:

- Stage state transitions should be evaluated inside the monthly projection loop because depletion can happen mid-year.
- Annual `YearRow` output should aggregate the monthly results and record any stage transitions that occurred during that projection year.
- Do not wait until year end to move to the next stage if the active stage depletes part-way through the year.

### YearRow stage-transition output

`YearRow` does not currently expose stage transitions. The first implementation that adds drawdown stages should add a structured, optional field rather than burying transitions in display text.

Suggested shape:

```ts
interface DrawdownStageTransition {
  month: number; // 1 to 12 within the projection year
  from_stage_id: string;
  from_stage_name: string;
  to_stage_id: string | null;
  to_stage_name: string | null;
  reason: 'stage_depleted' | 'source_unavailable' | 'validation_repair' | 'all_sources_depleted';
}

interface YearRow {
  drawdown_stage_transitions?: DrawdownStageTransition[];
}
```

If the active stage depletes and there is no next stage, `to_stage_id` / `to_stage_name` should be `null` and the reason should make the resulting shortfall or reduced-income outcome auditable.

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

Partial depletion within a calculation period:

1. Allocate the requested gross withdrawal across the available sources according to the configured shares, normalised across currently available sources.
2. Cap each source's gross withdrawal at its available balance for that period.
3. If any source is capped, redistribute the unfunded remainder across the still-available sources in the same stage, preserving their relative configured shares.
4. Repeat until either the requested withdrawal is fully allocated, no available sources remain in the stage, or only a penny-level residual remains.
5. If a residual remains because the stage is exhausted, move to the next stage and continue funding the same period's requested withdrawal from the next stage.

Example:

```text
Requested gross withdrawal this month: £1,000
Stage shares: Pot A 50%, Pot B 50%
Pot A available balance: £200
Pot B available balance: £2,000

Initial allocation: Pot A £500, Pot B £500
Pot A capped at £200, leaving £300 unfunded
Redistribute £300 to Pot B
Actual allocation: Pot A £200, Pot B £800
```

The workings should record both the configured/requested split and the actual split after capping and redistribution.

## Gross-up and tax interaction

Source allocation cannot be treated as a purely net-income split because sources have different tax treatments.

Examples:

- ISA withdrawals are tax-free.
- DC pension withdrawals may be partly tax-free and partly taxable.
- Different pension pots may have different tax-free portions or future tax-free cash treatment.

For target-led strategies, the engine must gross up taxable withdrawals sufficiently to try to meet the net target, subject to available balances and tax rules.

For blended stages, this means the engine needs an explicit gross-up process so that the resulting net income is close to the requested net amount while respecting the source allocation rule.

Recommended first-version gross-up algorithm for target-led strategies:

1. Calculate the net income already available for the period from guaranteed income and any non-drawdown sources.
2. Calculate the remaining net income requirement for the period.
3. If the requirement is zero or negative, no target-led drawdown is required for that period.
4. Use the active drawdown stage to produce an initial gross withdrawal estimate: `remaining_net_requirement / estimated_net_per_gross`.
5. Allocate that gross estimate across sources using the stage share/capping/rebalancing rules.
6. Calculate taxable income and tax using the normal tax module path for the period.
7. Compare resulting net income with the requested net amount.
8. Iterate the gross withdrawal estimate until the net result is within a defined tolerance or no further funding is available.

Recommended initial estimate for target-led gross-up:

```text
available_share_i = source target share after removing unavailable sources and renormalising remaining shares
tax_free_rate_i = 1.0 for tax-free accounts; dc_pot.tax_free_portion for DC pots
taxable_rate_i = 1.0 - tax_free_rate_i
estimated_marginal_tax_rate = current tax result's marginal rate for the period before this drawdown, or the configured basic-rate band rate if no current marginal rate is available
estimated_net_per_gross = sum(available_share_i * (tax_free_rate_i + taxable_rate_i * (1 - estimated_marginal_tax_rate)))
initial_gross_estimate = remaining_net_requirement / clamp(estimated_net_per_gross, 0.01, 1.0)
```

Example: a 40% ISA / 60% DC blend, where the DC pot has 25% tax-free portion and the estimated marginal tax rate is 20%, gives:

```text
ISA contribution: 0.40 * 1.00 = 0.400
DC contribution: 0.60 * (0.25 + 0.75 * 0.80) = 0.510
estimated_net_per_gross = 0.910
initial_gross_estimate = remaining_net_requirement / 0.910
```

This estimate is deliberately only a starting point. It will be wrong near tax-band boundaries or where allowances/tapers/caps apply, so the bounded convergence step remains the source of truth. Tests should assert the final converged output, not rely on the initial estimate except in focused unit tests for deterministic seeding.

Recommended convergence rules:

- Use a deterministic bounded search such as bisection rather than an unbounded increment loop.
- Lower bound: £0 additional gross withdrawal.
- Upper bound: total currently available gross withdrawal across the current and subsequent stages, capped further if the spending strategy imposes a maximum.
- Stop when the absolute net-income error is below £0.01 for the monthly calculation step, or after a fixed maximum such as 40 iterations.
- If the target cannot be met because available sources are exhausted, return the maximum fundable result and record the shortfall.

This algorithm is a specification target, not a requirement to duplicate the exact current projection implementation. The implementation must be covered by worked examples and tests before replacing the current sequential path.

### Portfolio-driven gross-up rule

Portfolio-driven strategies such as ARVA and Fixed Percentage calculate a gross withdrawal amount from portfolio rules. That gross withdrawal is the binding strategy output. The staged source-allocation engine should distribute that gross amount across sources using the same share/capping/rebalancing and stage-transition rules, but it should not gross up further to make net income equal the strategy amount.

Implications:

- Tax is calculated after allocating the strategy-calculated gross withdrawal.
- Net income achieved may be lower than the gross strategy withdrawal where taxable pension income is involved.
- Any configured target income is a planning benchmark only, so workings should show benchmark gap/adequacy rather than treating the difference as a failure to meet the strategy.
- If all selected sources cannot fund the strategy-calculated gross withdrawal, record the unfunded gross amount and resulting benchmark gap or reduced-income outcome.

This rule keeps portfolio-driven strategy maths separate from tax gross-up. If a later adviser-reviewed strategy is intended to produce a target net income after tax, it should be classified as target-led or explicitly documented as tax-aware.

Specification principle:

- The configured blend expresses the intended gross funding shares unless a later design deliberately chooses net-share semantics.
- Gross-share semantics mean `target_share` controls gross money leaving each source before tax; it does not promise that each source contributes the same percentage of net income after tax.
- The UI must explain that different tax treatments mean the net contribution from each source may not match the gross withdrawal percentage exactly.
- If adviser review favours net-share semantics, this document should be updated before implementation.

Open adviser question:

> Do you agree that first-version blended percentages should represent gross withdrawals from each source, rather than intended net income contribution after tax?

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

Simplified entitlement assumption:

- The app uses each pot's configured `tax_free_portion` as the available tax-free proportion for that pot.
- It does not track a separate crystallisation ledger.
- It does not track the UK's Lump Sum Allowance or Lump Sum and Death Benefit Allowance.
- Any validation that a tax-free amount does not exceed entitlement is therefore limited to the app's simplified per-pot assumption, not a full statutory allowance check.

UK/Isle of Man caveat:

- Pension tax-free cash treatment is currently framed around common UK DC pension assumptions.
- The app supports Isle of Man income-tax calculations, but this document does not yet validate whether each TFC/crystallisation assumption is appropriate for an Isle of Man resident or for cross-border UK/IoM pension circumstances.
- Adviser review should explicitly confirm the caveat wording and whether the first implementation should remain UK-assumption-led while IoM tax is applied separately to taxable income.

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
  id: string; // stable internal ID; not user-facing
  name?: string;
  sources: DrawdownStageSourceConfig[];
}

interface DrawdownStageSourceConfig {
  source_type: 'dc_pot' | 'tax_free_account';
  source_name: string;
  target_share: number; // decimal share, 0.0 to 1.0; e.g. 0.5 means 50%
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

- If `drawdown_stages` is missing, derive it from `withdrawal_priority` as one 100% source per stage, using `target_share: 1` and deterministic IDs such as `legacy_stage_1`.
- If per-pot TFC treatment is missing, treat the pot as `gradual_pro_rata` using the existing `tax_free_portion`.

## Validation rules

Suggested validation rules:

- A drawdown stage must contain at least one source.
- A drawdown stage must have a stable non-blank `id`; duplicate stage IDs in imported data must be rejected or repaired with explicit import feedback.
- A source must refer to an existing DC pot or tax-free account.
- Within a stage, configured source shares are decimal values from `0.0` to `1.0` and should sum to `1.0` for normal saved configs.
- The UI may temporarily allow non-`1.0` totals while editing, but must warn clearly and must not save silently ambiguous stages.
- Saved/imported configs with shares that do not sum to `1.0` should be handled explicitly: preferred first-version behaviour is to reject the invalid stage with a clear validation message rather than silently normalising financial intent.
- If a migration path must repair legacy invalid data, it should only normalise when the intended ratios are unambiguous, and the repair should be surfaced in config validation.
- Duplicate source entries inside a single stage should be rejected for the first implementation.
- A source may appear in more than one stage only if the intended semantics are explicitly defined. Initial recommendation: reject duplicates across stages to avoid confusing behaviour.
- TFC upfront amount/percentage must not exceed available tax-free entitlement under the app's simplified per-pot assumptions. This is not Lump Sum Allowance tracking.
- For `mode: 'upfront_lump_sum'`, a valid config must set exactly one of `upfront_amount` or `upfront_percentage_of_pot`. If both are present or neither is present, reject the config or require the user/import flow to choose one explicitly; do not infer precedence silently.
- If a TFC lump sum has a destination inside the plan, the destination must be explicit and included in workings.

## UI principles

The UI should avoid presenting this as one overloaded advanced setting.

Detailed workflow/fine-tuning plan: `docs/plans/2026-05-19-strategy-impact-and-what-if-workflow.md`.

Recommended page responsibilities:

1. Dashboard
   - Read-only output for the Current Plan shown on the Dashboard.
   - Shows the result of the currently selected Retirement Income Strategy.
   - Does not become the strategy authoring surface.

2. Strategy / Retirement Income Strategy
   - Authors the Current Plan strategy: income strategy, drawdown stages/order/blending, and planned pension-access/TFC events.
   - Makes clear that stage edits apply automatically to the Current Plan; no separate apply button is needed for manual edits.
   - Shows a compact current-strategy summary, including blended stage percentages.
   - Hosts the enhanced strategy comparison table.

3. What If
   - Consumes the Current Plan strategy as its baseline.
   - Varies a controlled set of scenario levers rather than duplicating the full drawdown-stage/blending editor.
   - Saves full scenario snapshots so Stress Test and Shootout can still compare powerful alternatives.
   - Can explicitly update scoped strategy fields back into the Current Plan via `Update Current Plan`.

4. Review
   - Records actuals, actual pension-access/TFC taken, and re-baseline decisions.
   - Detects material strategy changes but does not author future strategy structures.

Recommended Strategy page structure:

1. Income strategy
   - How much to draw.
   - Existing strategy selector.
   - Strategy-sensitive labels: Target income vs Planning benchmark.

2. Drawdown order and blending
   - Which pots/accounts fund withdrawals.
   - Ordered stages UI.
   - Single-source stage appears as simple sequential order.
   - Multi-source stage appears as a blend.
   - Copy should state: `Changes here update the Current Plan strategy automatically. No separate apply step is needed.`

3. Strategy Impact Comparison
   - Evolves the old Drawdown Order Analysis table.
   - Compares the current user-authored strategy with common sequential and blended alternatives.
   - Should include the Current strategy row, sequential alternatives, and simple blended alternatives such as `Blend DC pensions first, then tax-free accounts`.
   - Preferred framing: `Compare common source-order and blending patterns`, not `best strategy` or hidden tax optimisation.
   - Generated alternatives may offer `Use Selected Strategy in Current Plan`; the already-active Current strategy row should be labelled as already active.

4. Pension tax-free cash
   - Per DC pot / planned pension-access event.
   - Default: gradual pro-rata.
   - More advanced options hidden or clearly marked until adviser-reviewed.

Recommended wording for a stage:

> Use these sources together. If one runs out, the remaining sources in this stage are rebalanced before moving to the next stage.

Recommended wording for current simple TFC default:

> Tax-free cash is spread across withdrawals from this pension. For example, with 25% tax-free cash, each £1,000 withdrawal is treated as £250 tax-free and £750 taxable.

## Adviser review questions

1. Is the separation between spending strategy, source allocation, and pension tax-free cash clear and useful?
2. For blended stages, do you agree with the first-version recommendation that percentages represent gross withdrawal shares rather than intended net income contribution after tax?
3. Is one-source-per-stage plus multi-source blended stages sufficient for common client cases?
4. Should the first implementation reject the same source appearing in multiple stages?
5. Is gradual pro-rata pension tax-free cash an acceptable default approximation at this stage?
6. Which upfront tax-free lump-sum cases are important enough to model in the first version, if any?
7. Is the Strategy / What If responsibility split right: Strategy authors source-order/blending/TFC rules, while What If consumes those rules and varies only controlled scenario levers?
8. Which common blended/sequential patterns should appear in the first Strategy Impact Comparison table?
9. Should tax-aware optimisation remain a later optional feature rather than part of the initial blended drawdown model?
10. What caveat wording would be appropriate for adviser/client use?

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

- golden migration test proving legacy `withdrawal_priority` migration to one-source stages preserves current projection output exactly;
- sequential stages matching current projection output exactly for DC-first, ISA-first, and mixed-source priorities;
- simple two-source blend with tax-free account and DC pension;
- blend rebalancing after one source depletes mid-period;
- stage transition after all sources in a stage deplete;
- target-led strategy funding a net target through the bounded gross-up algorithm;
- target-led strategy recording a shortfall when the bounded gross-up cannot meet the target;
- portfolio-driven strategy funding a strategy-calculated withdrawal;
- per-pot gradual pro-rata TFC matching current behaviour;
- validation/rejection of invalid share totals, duplicate sources, and missing sources;
- workings data showing configured split, actual split, gross withdrawal, taxable/tax-free portions, tax, net income, shortfall, and structured stage transitions.

Compatibility rule:

- Existing saved configs without drawdown-stage or TFC-treatment fields must continue to project as they do today.

## Implementation phasing

Suggested phases:

1. Specification and adviser review
   - Review this document.
   - Confirm gross-share semantics for blended percentages, or explicitly switch to net-share semantics before implementation.
   - Confirm first-version TFC scope and UK/IoM caveat wording.

2. Data model and migration
   - Add drawdown-stage config types using decimal `target_share` values.
   - Derive stages from existing `withdrawal_priority`.
   - Add validation for share totals, duplicate/missing sources, duplicate stage IDs, and TFC amount-vs-percentage exclusivity.
   - Preserve current output for sequential cases, proven by golden migration tests before engine changes.

3. Engine support for stages
   - Implement one-source stages first.
   - Add multi-source gross-share blending.
   - Add bounded target-led gross-up/convergence with deterministic initial estimate seeding.
   - Apply portfolio-driven withdrawals as gross strategy outputs without net-income gross-up.
   - Add partial-depletion rebalancing and monthly stage transitions.

4. Workings and UI transparency
   - Surface active stage, requested split, actual split, tax, and shortfall/benchmark gap.
   - Keep target-led vs portfolio-driven wording consistent.
   - Add Strategy-page copy that manual stage edits update the Current Plan automatically.
   - Show a compact Current strategy summary after edits, especially for blended stages.

5. Strategy Impact Comparison
   - Reframe the old Drawdown Order Analysis table as `Strategy Impact Comparison`.
   - Compare Current strategy, common sequential alternatives, and simple blended alternatives.
   - Ensure every comparison candidate rebuilds matching `drawdown_stages`; do not evaluate rows against stale legacy `withdrawal_priority`.
   - Provide `Use Selected Strategy in Current Plan` only for generated alternatives; label the Current strategy row as already active.

6. What If integration
   - Keep What If as scenario comparison, not full strategy authoring.
   - Start sandbox configs from the Current Plan strategy.
   - Saved scenarios should preserve strategy snapshots for Stress Test and Shootout.
   - Promotion back to Current Plan remains scoped to strategy/TFC fields and must preserve fund values, tax settings, income sources, Review history, and saved scenarios.

7. Optional per-pot TFC treatment expansion
   - Keep gradual pro-rata as default.
   - Add upfront lump-sum only if adviser/user review confirms scope.

8. Later optimisation work
   - Add explicit optimiser-suggested stage structures only after the manual staged model and Strategy Impact Comparison are trusted.
   - Clearly distinguish user-authored rules from optimiser suggestions.
