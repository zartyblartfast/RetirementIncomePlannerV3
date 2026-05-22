# Pension Access Ledger and Crystallisation Plan

Status: design checkpoint before further implementation  
Scope: Retirement Income Planner V3 — DC pension access, tax-free cash, UFPLS, phased crystallisation, and flexi-access drawdown semantics

This is a design/spec addendum, not implementation code and not regulated financial advice. It exists to stop the app bolting further tax-free-cash controls onto the wrong abstraction.

## Decision summary

RIP should keep the existing gradual pro-rata pension-withdrawal behaviour as a labelled simplified approximation, but future adviser-credible pension-access work should move toward an explicit pension ledger.

The ledger must distinguish:

1. Uncrystallised pension funds.
2. Crystallised flexi-access drawdown funds.
3. Tax-free lump sums / PCLS / TFC already taken.
4. Taxable drawdown already taken.
5. Lump Sum Allowance usage, or a clear caveat that it is not enforced.
6. MPAA trigger status and date, or a clear warning that it is not fully modelled.

Without those distinctions, RIP cannot honestly explain the difference between UFPLS, phased crystallisation/PCLS, and taxable flexi-access drawdown.

## Why this checkpoint exists

The current Dev02 TFC event work is useful because it proves that pension-access events can be shown as capital events that reduce pension balances without inflating ordinary income or taxable income.

But the current model is still incomplete for true pension access planning:

- monthly pro-rata pension withdrawals are closest to a simplified UFPLS-like cash-flow approximation;
- phased crystallisation requires a split between uncrystallised funds and crystallised drawdown funds;
- taxable withdrawals from crystallised drawdown are 100% taxable pension income;
- PCLS can be taken without triggering MPAA, while UFPLS and taxable flexi-access drawdown can trigger MPAA;
- PCLS and the 25% tax-free part of UFPLS count towards the Lump Sum Allowance.

So the next implementation should not just add more TFC UI. It should first settle the pension-access mode and ledger semantics.

## Separation of concerns

RIP should keep four separate concepts:

1. Spending strategy
   - Answers: how much income or withdrawal should be generated?
   - Examples: Fixed Target, Guardrails, ARVA, Fixed Percentage.

2. Source allocation
   - Answers: which pots/accounts fund ordinary withdrawals?
   - Implemented through staged drawdown: sequential, blended, or hybrid source groups.

3. Pension access mode
   - Answers: how does a DC pension pot legally/administratively provide the accessed money?
   - Examples: simplified pro-rata approximation, UFPLS, phased crystallisation/PCLS, taxable flexi-access drawdown.

4. Tax calculation and warnings
   - Answers: what income is taxable, what lump-sum allowances are used, and what warnings apply?
   - This should eventually flow through tax events/rule modules, not ad-hoc UI assumptions.

User-facing shorthand:

> The income strategy decides how much to draw. The drawdown stages decide where it comes from. The pension access mode decides whether pension money is UFPLS, PCLS/crystallisation, or taxable drawdown.

## Current baseline to preserve

Current compatible behaviour:

- Each DC pot has an investable balance.
- Ordinary DC withdrawals are split using `tax_free_portion`.
- A 25% `tax_free_portion` means each ordinary pension withdrawal is treated as 25% tax-free and 75% taxable.
- Existing Dev02 pension-access/TFC capital events can reduce a pot balance without adding to ordinary net income, taxable income, or tax.
- Dev03 now carries a projection-time pension ledger side-channel for DC pots, including uncrystallised balance, crystallised drawdown balance, tax-free cash taken, taxable drawdown taken, and MPAA/LSA warning state.
- The first explicit crystallise-and-take-PCLS event application is narrow: it crystallises a configured slice in the ledger, pays the PCLS as a separate tax-free capital event, keeps PCLS out of ordinary/taxable income, and does not trigger MPAA.
- Dev03 also now applies explicit taxable flexi-access drawdown events from the ledger's crystallised drawdown balance. These events reduce pension capital, count as 100% taxable pension income, and trigger MPAA warning/status.
- Expanded Year Table detail and year workings now surface explicit pension-access events, including PCLS/FAD treatment, pot balance movement, uncrystallised/crystallised ledger movement when available, and MPAA/caveat wording.
- Strategy now has guarded authoring controls for explicit PCLS crystallisation and taxable FAD events alongside the older simple TFC event, with UFPLS deliberately not exposed pending adviser/provider validation.
- The app does not yet drive ordinary staged withdrawals from crystallised drawdown balances, apply UFPLS events in projection, or fully enforce LSA/LSDBA rules.

This mode should remain available for migration and simpler users, but it must be labelled honestly.

Recommended label:

> Simplified pro-rata pension withdrawals

Recommended caveat:

> This approximates each pension withdrawal as part tax-free and part taxable. It does not maintain a formal crystallised/uncrystallised pension ledger or distinguish UFPLS, phased crystallisation, and taxable flexi-access drawdown.

## Source-check outcome for structural classifications

The proposed classifications are usable as app/model structures, but they should not all be presented as equal legal pension-access routes.

| Classification | Source-check result | Structural status in RIP |
|---|---|---|
| Simplified pro-rata approximation | App compatibility approximation, not an HMRC pension-access route. It resembles UFPLS cash-flow splitting but lacks formal uncrystallised-fund, LSA, PAYE, and MPAA treatment. | Keep as `simplified_pro_rata` / compatibility mode. Label clearly as an approximation. |
| UFPLS | Confirmed HMRC route. PTM063300 says UFPLS is paid from uncrystallised money purchase funds; normally 25% tax-free and 75% taxable pension income; tested against LSA and LSDBA. PTM056520 says first UFPLS triggers MPAA. | Valid explicit event/access type. |
| Phased crystallisation/PCLS | Confirmed model pattern built from HMRC PCLS and flexi-access drawdown rules. PTM063210 says PCLS is a tax-free lump sum connected to entitlement to relevant pension benefits and reduces LSA/LSDBA. PTM062730 describes designating funds to flexi-access drawdown and taking a tax-free PCLS. PTM056530 says PCLS does not trigger MPAA. | Valid compound event: crystallise funds, pay PCLS, designate remainder to crystallised drawdown. |
| Taxable flexi-access drawdown | Confirmed HMRC drawdown treatment. PTM062730 says flexi-access drawdown pension is chargeable to income tax as pension income, and PTM056520 says the first income withdrawal from a new flexi-access drawdown fund triggers MPAA. | Valid explicit event/access type from crystallised drawdown balance. |
| Full/partial upfront PCLS | Not a separate legal route. It is a timing/amount pattern using crystallisation + PCLS mechanics. PTM062730 examples show full-pot style designation where a PCLS is taken and the remainder is designated to drawdown. | Model as a crystallisation/PCLS event with timing/amount parameters, not a separate top-level route. |

Source-checked allowance point:

- GOV.UK says PCLS, the 25% tax-free part of UFPLS, and standalone lump sums count towards Lump Sum Allowance.
- GOV.UK also says anything counting towards Lump Sum Allowance also counts towards Lump Sum and Death Benefit Allowance.

Structural implication for code:

- Use separate internal categories for `compatibility_approximation`, `pension_access_event_type`, and `timing_pattern` rather than one flat enum that implies all entries are legally equivalent routes.
- In UI, keep “Simplified pro-rata” and “Full/partial upfront PCLS” visually distinct from official event types such as UFPLS and taxable flexi-access drawdown.

## Cadence decision for phased access

Default modelling stance:

- Annual, tax-year-aligned crystallisation is the default cadence for phased crystallisation/PCLS and UFPLS planning.
- The common adviser planning question is normally annual: how much should be crystallised or accessed in this tax year, given guaranteed income, desired spending, tax bands, LSA headroom, and MPAA implications?
- More frequent crystallisation cadences are possible, but should be treated as later enhancements unless adviser feedback says they are important for the first explicit model.
- Monthly income from an already crystallised flexi-access drawdown fund is a separate concept from the crystallisation/PCLS event itself.

Initial cadence options for the model:

| Cadence | Initial status | Intended use |
|---|---|---|
| `annual` | Default | Tax-year planning for phased crystallisation/PCLS and UFPLS. |
| `ad_hoc` | Supported as one-off event timing | Retirement-date or user-specified lump events. |
| `monthly` | Later / drawdown-income oriented | Regular taxable income from already crystallised FAD, not the default crystallisation cadence. |
| `half_yearly` / `quarterly` | Later enhancement | Only if adviser validation says these are materially useful. |

Implementation implication:

- For now, encode annual-first cadence as metadata and planning semantics, not as a broad projection rewrite.
- Keep event timing deterministic and tax-year-aware when recurring explicit crystallisation is implemented.
- Do not imply that annual cadence is a rule; it is a planning default requiring adviser/user validation.

## Crystallised drawdown investment-growth assumption

Default modelling stance:

- Crystallised flexi-access drawdown funds are assumed to remain invested and earn the same growth rate and fee drag as the parent DC pot unless a later user/adviser setting says otherwise.
- This reflects the common modern drawdown wrapper pattern: crystallised and uncrystallised balances may be separate administrative sub-balances, but the member can often keep them invested in the same or similar funds.
- Provider behaviour varies. Some providers may use separate drawdown accounts, and some advisers may recommend holding near-term income in cash or money-market funds.
- RIP does not yet model a separate crystallised drawdown growth rate or cash-buffer strategy.

Implementation implication:

- Monthly projection growth and fees still apply to the total DC pot balance as before.
- The ledger side-channel attributes that net investment return proportionally across the pot's uncrystallised and crystallised drawdown balances.
- This keeps `uncrystallised_balance + crystallised_drawdown_balance` reconciled to the projected DC pot balance without changing the existing pot-level growth source of truth.

Suggested caveat wording:

> Crystallised drawdown funds are assumed to remain invested and earn the same growth rate as the pension pot. Provider behaviour varies; some users/advisers hold near-term income in cash or lower-risk funds. This model does not yet support a separate crystallised drawdown growth rate.

## Pension access modes

### 1. Simplified pro-rata approximation

Purpose:

- Keep current behaviour stable.
- Provide a simple planning approximation for users who do not want detailed pension-access modelling.

Model:

- Ordinary pension withdrawal reduces the DC pot balance.
- Tax-free amount = gross withdrawal x pot tax-free proportion.
- Taxable amount = gross withdrawal - tax-free amount.
- No formal crystallised/uncrystallised sub-balance is maintained.
- No formal LSA/LSDBA enforcement.
- MPAA is not reliably inferred.

Adviser-facing caveat:

- Treat as a broad cash-flow approximation, not a legal/admin pension-access route.

### 2. UFPLS

Purpose:

- Model uncrystallised funds pension lump sums.

Core mechanics:

- Payment comes directly from uncrystallised money purchase funds.
- Normally 25% is tax-free and 75% is taxable pension income.
- The tax-free part counts towards Lump Sum Allowance.
- The first UFPLS is an MPAA trigger event.
- The whole payment reduces uncrystallised balance.

Ledger effect:

```text
uncrystallised_balance -= gross_ufpls
ordinary_taxable_income += taxable_part
lsa_used += tax_free_part
mpaa_triggered = true on first UFPLS
```

Workings should show:

- gross UFPLS;
- tax-free part;
- taxable pension income part;
- uncrystallised balance before/after;
- LSA used/remaining or caveat;
- MPAA trigger warning/status.

### 3. Phased crystallisation with PCLS

Purpose:

- Model crystallising part of a pension pot, taking PCLS, and designating the balance into flexi-access drawdown.

Core mechanics:

- A slice of uncrystallised funds is crystallised.
- Up to the permitted tax-free amount is taken as PCLS.
- The remaining crystallised amount moves into a crystallised drawdown fund.
- Taking PCLS alone does not trigger MPAA.
- Later taxable withdrawals from the crystallised drawdown fund are 100% taxable pension income and can trigger MPAA.

Ledger effect for crystallisation/PCLS:

```text
uncrystallised_balance -= amount_crystallised
pcls_paid += pcls_amount
crystallised_drawdown_balance += amount_crystallised - pcls_amount
lsa_used += pcls_amount
mpaa unchanged if no taxable drawdown is taken
```

Workings should show:

- amount crystallised;
- PCLS/TFC paid;
- amount designated to crystallised drawdown;
- uncrystallised balance before/after;
- crystallised drawdown balance before/after;
- LSA used/remaining or caveat;
- MPAA not triggered by PCLS-only event.

### 4. Taxable flexi-access drawdown

Purpose:

- Model withdrawals from crystallised drawdown funds.

Core mechanics:

- Withdrawal comes from crystallised drawdown balance.
- Withdrawal is 100% taxable pension income.
- First taxable flexi-access drawdown payment triggers MPAA.
- No further PCLS is generated from already-crystallised funds.

Ledger effect:

```text
crystallised_drawdown_balance -= taxable_drawdown
ordinary_taxable_income += taxable_drawdown
mpaa_triggered = true on first taxable flexi-access drawdown
```

Workings should show:

- taxable drawdown amount;
- crystallised balance before/after;
- tax treatment;
- MPAA trigger/status.

### 5. Full or partial upfront PCLS

Purpose:

- Model front-loaded tax-free cash where a user crystallises all or part of a pot and takes PCLS immediately.

This is not a separate legal route from phased crystallisation; it is a timing pattern using the same crystallisation/PCLS mechanics.

Examples:

- crystallise 100% of a pot at retirement;
- take 25% PCLS, subject to allowances and scheme rules;
- designate 75% into crystallised drawdown;
- future withdrawals from that 75% are taxable drawdown.

This should be represented using crystallisation/PCLS events, not a special one-off field hidden on the DC pot.

## Proposed ledger state

At minimum, each DC pension pot needs a derived projection-time ledger state.

Conceptual shape:

```ts
interface PensionLedgerState {
  pot_ref: string;
  pot_name: string;
  uncrystallised_balance: number;
  crystallised_drawdown_balance: number;
  tax_free_cash_taken: number;
  taxable_drawdown_taken: number;
  lsa_used?: number;
  lsa_remaining?: number;
  lsa_tracking_status: 'tracked' | 'warning_only' | 'not_modelled';
  mpaa_triggered: boolean;
  mpaa_trigger_date?: string;
  warnings: PensionLedgerWarning[];
}
```

The implementation shape can differ, but the model must preserve the same distinctions.

## Pension access events

The durable event model should be expanded from generic TFC events toward explicit access events.

Conceptual event types:

```ts
type PensionAccessEventType =
  | 'simplified_tax_free_cash_capital_event'
  | 'ufpls'
  | 'crystallise_and_take_pcls'
  | 'taxable_flexi_access_drawdown'
  | 'already_taken_marker';
```

Event fields should include:

- stable event id;
- pot reference;
- timing rule/date;
- amount rule;
- event type;
- optional destination/cash-flow label;
- notes;
- caveat/warning codes.

Resolved projection events should include:

- projection year/month;
- ordering within month;
- pot balance before/after;
- uncrystallised balance before/after where modelled;
- crystallised drawdown balance before/after where modelled;
- tax-free amount;
- taxable amount;
- LSA impact or caveat;
- MPAA impact or caveat;
- warnings.

## Event ordering

For a monthly projection step, use a deterministic documented order.

Proposed initial order:

1. Apply monthly growth and fees to pension pot balances.
2. Resolve scheduled pension-access events for that month.
3. Apply crystallisation/PCLS/UFPLS events before ordinary monthly drawdown allocation.
4. Apply ordinary drawdown stages for the month.
5. Calculate tax from resulting income events.
6. Aggregate monthly events into annual `YearRow` output.

Reason:

- percentage-of-pot events should use a clear event-time balance;
- PCLS/crystallisation may create crystallised drawdown funds available for later taxable drawdown;
- ordinary income should not be inflated by PCLS capital events.

If implementation later needs a different order, this document and tests should be updated before coding.

## Interaction with staged drawdown

Staged drawdown should remain the model for ordinary withdrawal source allocation.

But ordinary withdrawals from a DC pot must depend on that pot's selected pension access mode:

- simplified pro-rata: ordinary withdrawal is split tax-free/taxable using the pot assumption;
- UFPLS mode: ordinary pension access from uncrystallised funds is represented as UFPLS payments;
- crystallised drawdown mode: ordinary withdrawal comes from crystallised drawdown balance and is taxable;
- mixed mode: the app may need explicit rules for when to crystallise more uncrystallised funds to supply taxable drawdown.

Do not hide crystallisation decisions inside drawdown-stage allocation. If a stage says “DC Pension funds this withdrawal”, the pension access mode must explain how that pension money is accessed.

## LSA / LSDBA handling

Minimum safe position for near-term implementation:

- Track tax-free lump sums paid by the model where possible.
- Show estimated LSA used and remaining if the app has enough assumptions.
- Otherwise show a warning-only caveat.
- Do not silently enforce or ignore allowance limits without explaining it.

Important source-checked rule:

- PCLS counts toward Lump Sum Allowance.
- The 25% tax-free part of UFPLS counts toward Lump Sum Allowance.
- Anything that counts toward Lump Sum Allowance also counts toward Lump Sum and Death Benefit Allowance.

Near-term caveat wording:

> Lump Sum Allowance tracking is simplified. Check actual allowance usage, prior pension benefits, protections, and provider records before relying on these figures.

## MPAA handling

Minimum safe position:

- PCLS-only crystallisation should show “MPAA not triggered by this event”.
- UFPLS should show an MPAA trigger warning/status.
- First taxable flexi-access drawdown should show an MPAA trigger warning/status.
- The app should track a modelled `mpaa_triggered` flag/date when using explicit modes.

Near-term caveat wording:

> MPAA status is modelled only for the pension-access events represented here. Actual contribution limits can depend on previous pension access outside this plan.

## Isle of Man and provider caveats

Keep these as explicit caveats until separately specified:

- Isle of Man pension-freedom / PFS treatment, including possible 40% one-off PFS assumptions.
- UK pension scheme rules as applied to an Isle of Man resident.
- Provider availability and charges for UFPLS, phased drawdown, partial crystallisation, and regular crystallisation.
- Emergency tax and PAYE timing.
- Transitional protections and prior lifetime allowance / lump-sum allowance history.
- Death-benefit and IHT effects.

The app can support planning scenarios, but it should not imply that every provider or jurisdiction supports every event pattern.

## UI implications

Do not expose this as one overloaded “tax-free cash” field.

Recommended progressive UI model:

1. Simple mode
   - “Simplified pro-rata pension withdrawals”.
   - Shows tax-free proportion and clear caveat.

2. Event mode
   - “Planned pension access events”.
   - Allows explicit events such as PCLS/crystallisation, UFPLS, or taxable drawdown.
   - Shows selected pot, event date/timing, amount basis, and warnings.

3. Ledger/workings view
   - Shows uncrystallised and crystallised balances where explicit mode is active.
   - Shows annual pension-access events separately from ordinary income.
   - Shows LSA/MPAA caveats/status.

Plain-English labels should be used first, with acronyms explained:

- “UFPLS — taxable/tax-free lump sum from uncrystallised pension funds”
- “PCLS / tax-free cash from crystallising part of a pension”
- “Taxable drawdown from crystallised pension funds”

## Workings requirements

For every year with pension access activity, annual workings should show:

- ordinary income strategy result;
- ordinary drawdown-stage allocations;
- pension access events separately from ordinary income;
- gross pension access amount;
- tax-free amount;
- taxable pension income amount;
- pension balance before/after;
- uncrystallised/crystallised balance movement where modelled;
- LSA impact or caveat;
- MPAA impact or caveat;
- warning codes in adviser-readable wording.

The Year Table must not make PCLS/TFC look like ordinary recurring income unless the selected event actually creates taxable income.

## Migration strategy

Existing configs should remain valid.

Suggested migration semantics:

- Missing pension access mode means `simplified_pro_rata`.
- Existing `tax_free_portion` remains the simplified pro-rata proportion.
- Existing Dev02 `tax_free_cash` metadata remains display/migration metadata unless explicit events are present.
- Existing `pension_access_events` with current `tax_free_cash` event type should map to `simplified_tax_free_cash_capital_event` or stay as a compatibility event until the explicit ledger model replaces it.
- No old config should accidentally gain UFPLS or crystallisation semantics without user action.

## Implementation checkpoint sequence

Do not implement all of this at once.

Recommended checkpoints:

1. Spec acceptance
   - Review this document with the user.
   - Decide which mode is first: preserve simplified mode only, or add explicit crystallisation ledger foundation.

2. Types and validation only
   - Add explicit pension access mode / ledger types.
   - Add validation and migration tests.
   - No projection output change.

3. Projection ledger foundation
   - Derive uncrystallised/crystallised ledger state during projection.
   - Preserve existing simplified mode outputs.
   - Add tests proving no change to old configs.

4. Explicit crystallisation/PCLS event — first narrow slice implemented on Dev03
   - Apply crystallisation/PCLS events to the ledger.
   - Keep PCLS out of ordinary taxable income.
   - Surface LSA/MPAA caveats.
   - Current limitation: the projection balance is reduced by the paid PCLS/outside-plan capital amount, while the designated crystallised remainder is tracked in the ledger side-channel; ordinary staged withdrawals are not yet switched to draw from that crystallised balance.

5. Taxable flexi-access drawdown event — first narrow slice implemented on Dev03
   - Withdraw from crystallised drawdown balance.
   - Treat as 100% taxable pension income.
   - Trigger MPAA warning/status.
   - Current limitation: only explicit `taxable_flexi_access_drawdown` pension-access events are applied. Ordinary staged DC withdrawals still use the existing simplified pro-rata mechanics unless a later slice switches a pot/source into explicit crystallised-drawdown mode.

6. UFPLS mode/event
   - Withdraw from uncrystallised balance.
   - Split 25% tax-free / 75% taxable, subject to configured assumptions.
   - Trigger MPAA warning/status.

7. Workings/UI pass
   - Add ledger details to Year Table / Year Workings.
   - Add clear labels and warnings.
   - Avoid jargon-only controls.

8. Adviser/demo pass
   - Add worked examples.
   - Add caveat wording to adviser pack/checklist.
   - Verify examples against official sources before adviser-facing use.

## Open questions before code

1. Should the first explicit mode be phased crystallisation/PCLS, UFPLS, or just a ledger scaffold with no new user-visible event types?
2. Should each DC pot have a default access mode, or should access mode live only on events?
3. Should staged drawdown automatically create taxable drawdown events from crystallised balances, or should crystallisation/drawdown events be explicit at first?
4. Should the app track LSA numerically in the first ledger checkpoint, or show warning-only caveats until prior pension history is captured?
5. How should Isle of Man-specific PFS possibilities be represented without confusing the UK default model?
6. What is the minimum adviser demo example: simple upfront PCLS, annual phased crystallisation, UFPLS comparison, or all three?

## Near-term recommendation

Before more code, agree this product direction:

- keep simplified pro-rata as the safe default and migration path;
- introduce an explicit pension ledger as the next foundation;
- model PCLS/crystallisation and taxable flexi-access drawdown as separate from UFPLS;
- track or clearly caveat LSA and MPAA;
- keep pension-access capital events separate from ordinary income in all tables/charts/workings.

If accepted, the next code checkpoint should be types/validation/migration only, with no projection behaviour change.
