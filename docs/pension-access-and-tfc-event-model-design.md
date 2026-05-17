# Pension Access and Tax-Free Cash Event Model Design

Status: draft design note for Dev02 discussion
Created: 2026-05-16
Scope: Retirement Income Planner V3 — future pension tax-free cash / access foundation

This document is a design note, not implementation code and not regulated financial advice. It records the intended direction before any projection-engine changes: build a modular, event-led pension access foundation that can support future tax-free cash refinements without bolting narrow one-off fields onto DC pots.

Related notes:

- [`tax-free-lump-sum-research.md`](./tax-free-lump-sum-research.md) — UK tax-free-cash research and future-scope checklist.
- [`pension-tax-free-cash-terminology.md`](./pension-tax-free-cash-terminology.md) — plain-English terminology companion.
- [`isle-of-man-pension-freedom-tax-free-lump-sum-research.md`](./isle-of-man-pension-freedom-tax-free-lump-sum-research.md) — Isle of Man PFS / trivial-commutation research note.

## 1. Design goal

Dev02 should introduce the foundation for a fuller pension access and tax-free cash model, even if only a conservative subset is implemented or exposed at first.

The goal is not simply to add an "upfront lump sum" option. The goal is to define clear data structures and UI semantics for:

- tax-free cash taken separately from regular drawdown;
- tax-free cash taken before, at, after, or without regular drawdown;
- one or more tax-free cash events from the same pension pot, subject to simplified entitlement and balance assumptions;
- regular drawdown stages that continue to decide where ordinary withdrawals come from;
- transparent workings showing how pension access events affect pot balance, taxable income, tax-free cash used, and remaining estimated entitlement.

## 2. Core principle

Keep these concerns separate:

1. Spending strategy
   - How much income or withdrawal is requested or generated.
   - Examples: Fixed Target, Guardrails, ARVA, Fixed Percentage.

2. Regular drawdown source allocation
   - Which pots/accounts fund ordinary withdrawals.
   - Implemented through drawdown stages and source shares.

3. Pension access / tax-free cash strategy
   - What tax-free cash or other pension access events occur, when they occur, and how they affect pension state.

4. Tax calculation
   - How taxable pension income and other taxable income are taxed under the selected tax pack/module.

5. UI explanation
   - How the above is shown clearly enough that a user/adviser can understand and challenge the assumptions.

These should not be collapsed into a single overloaded "drawdown strategy" or hidden inside a single pot field.

## 3. Current baseline

Current RIP behaviour is deliberately simple:

- Each DC pot has `tax_free_portion`, usually 0.25.
- Each ordinary DC withdrawal is split pro-rata:
  - tax-free amount = withdrawal x `tax_free_portion`;
  - taxable pension income = withdrawal minus tax-free amount.
- The current `tax_free_cash` metadata records this as `mode: 'gradual_pro_rata'`.
- The app does not yet track crystallised vs uncrystallised sub-pots, explicit PCLS events, full Lump Sum Allowance / Lump Sum and Death Benefit Allowance usage, MPAA, emergency tax, or provider-specific rules.

This baseline must remain migration-compatible and should continue to be available as the default.

## 4. Target conceptual model

### 4.1 DC pot state

A DC pot has an investable balance and pension-access-related state.

The investable balance is affected by:

- growth;
- fees;
- ordinary regular drawdown withdrawals;
- explicit tax-free cash events;
- future taxable lump-sum or crystallisation events, if added later.

The design should make event ordering explicit before implementation. For example, if growth, fees, ordinary drawdown, and a tax-free-cash event all occur in the same projection month, the engine should have one documented ordering rule rather than leaving results dependent on incidental code order.

### 4.2 Estimated TFC entitlement state

The app should have an explicit place for estimated tax-free cash entitlement state, even if the first calculation uses simplified rules.

Possible conceptual fields:

```ts
interface PensionTaxFreeCashState {
  entitlement_basis: 'gradual_pro_rata' | 'simplified_25_percent' | 'manual_remaining' | 'already_taken' | 'unknown';
  tax_free_proportion: number; // e.g. 0.25, where applicable
  estimated_entitlement_opening?: number;
  tax_free_cash_used_to_date?: number;
  estimated_entitlement_remaining?: number;
  caveat_code?: 'no_lsa_tracking' | 'manual_estimate' | 'provider_specific_unknown';
}
```

The exact implementation shape can change, but the model should explicitly distinguish:

- the pot balance;
- tax-free cash already used;
- estimated tax-free cash remaining;
- assumptions/caveats behind that estimate.

### 4.3 Pension access event ledger

The model should support a per-pot event ledger. Events are the durable foundation.

Possible conceptual event shape:

```ts
interface PensionAccessEventConfig {
  id: string;
  pot_ref: string; // stable pot/source reference; UI may display the pot name
  event_type: 'tax_free_cash' | 'ordinary_drawdown_marker' | 'already_taken_marker';
  timing: PensionAccessEventTiming;
  amount: PensionAccessEventAmount;
  destination?: PensionAccessEventDestination;
  notes?: string;
}

interface PensionAccessEventTiming {
  kind: 'date' | 'age' | 'retirement_date' | 'first_drawdown_from_pot' | 'plan_start';
  date?: string; // YYYY-MM when kind === 'date'
  age?: number;  // when kind === 'age'
}

interface PensionAccessEventAmount {
  kind: 'fixed_amount' | 'percentage_of_pot' | 'percentage_of_estimated_tfc_remaining';
  value: number;
}

type PensionAccessEventDestination = 'outside_plan' | 'held_as_cash_event' | 'tax_free_account' | 'cash_account';
```

Important design rule:

- `first_drawdown_from_pot` is a useful convenience timing rule, but it is not the core model.
- TFC can be taken before, after, or without regular drawdown.
- Therefore regular drawdown stages and TFC events must remain separate.
- Event rows should reference a stable pot/source identifier where possible, not only a display name, so renaming a pension pot does not orphan its planned access events.
- Any percentage-based amount must define its base clearly, for example pot balance immediately before the resolved event, or estimated TFC remaining immediately before the event.

### 4.4 Resolved projection events

Config events express user intent. The projection engine should resolve them into dated calculation events.

A resolved event should be able to report:

- resolved date / projection month;
- source pot;
- event ordering within the month;
- pot balance before event;
- tax-free amount;
- taxable amount, if any;
- pot balance after event;
- estimated TFC entitlement used;
- estimated TFC entitlement remaining;
- caveats/warnings.

Suggested conceptual output:

```ts
interface PensionAccessResolvedEvent {
  id: string;
  pot_ref: string;
  pot_name: string;
  projection_year: string;
  month: number;
  order_in_month: number;
  event_type: 'tax_free_cash' | 'ordinary_drawdown';
  gross_amount: number;
  tax_free_amount: number;
  taxable_amount: number;
  pot_balance_before: number;
  pot_balance_after: number;
  estimated_tfc_used: number;
  estimated_tfc_remaining: number;
  caveats: string[];
}
```

This output should feed YearRow/workings rather than being recomputed independently by UI components.

## 5. Supported behaviours by phase

### Foundation target

The foundation should support the shape of the full model:

- multiple events per pot;
- separate timing and amount rules;
- TFC events independent of ordinary drawdown;
- ordinary drawdown stages unchanged as the source-allocation model;
- structured annual workings;
- migration from current gradual pro-rata metadata.

### Initial ruleset may be conservative

The first calculation ruleset may deliberately exclude:

- full legal crystallised/uncrystallised sub-pot accounting;
- LSA/LSDBA tracking;
- MPAA warnings/contribution planning;
- emergency-tax/PAYE timing;
- provider-specific restrictions;
- Isle of Man PFS 40% one-off modelling;
- UFPLS as a fully distinct legal/admin access route.

Those exclusions must be visible in design docs and UI caveats where relevant.

The current code already contains a small `tax_free_cash` metadata shape on DC pots, including placeholder fields such as upfront amount/percentage and destination, but the normalisation path currently forces the effective mode back to `gradual_pro_rata` and removes unsupported event fields. Treat those existing fields as migration/compatibility scaffolding, not as implemented upfront-lump-sum behaviour.

## 6. Interaction with regular drawdown stages

Regular drawdown stages answer:

> Which source funds ordinary withdrawals, and in what proportion/order?

Pension access/TFC events answer:

> What pension access events happen, when, and how much of the payment is tax-free or taxable?

They interact through shared state:

- a TFC event reduces pension pot balance;
- a TFC event reduces estimated TFC remaining;
- ordinary regular drawdown reduces pension pot balance;
- ordinary regular drawdown may also consume TFC entitlement under gradual pro-rata treatment;
- if a pot has no TFC remaining or is marked already taken, ordinary drawdown from it may be fully taxable.

But the UI should not imply that "drawdown starts" and "TFC is taken" are the same event.

## 7. UI design principles

UI design is as important as engine design. The model will fail if users cannot understand it.

### 7.1 Placement

The Drawdown Order page remains the likely home because users are already thinking about retirement income strategy there.

Recommended page structure:

1. Income strategy
   - How much income is requested/generated.

2. Drawdown order and blending
   - Which sources fund ordinary withdrawals.

3. Pension tax-free cash and access events
   - Per DC pot.
   - Separate from ordinary drawdown stages.
   - Clear default: gradual pro-rata.
   - Advanced event schedule available when needed.

Dashboard should remain read-only:

- compact summary of current applied TFC/access settings;
- no detailed editing;
- link back to Drawdown Order.

What If should remain exploratory:

- compare alternative TFC event schedules;
- do not apply to base plan without explicit action.

### 7.2 Progressive disclosure

The UI should not present the full pension-access domain all at once.

Recommended levels:

Level 1: Simple default

- "Tax-free cash is spread across withdrawals from this pension."
- Show the current percentage.
- No event table shown unless user chooses a different treatment.

Level 2: Planned tax-free cash events

- User can add dated events.
- Table shows date/age, amount, destination, and caveat.
- Regular drawdown remains separate.

Level 3: Advanced details / assumptions

- Estimated entitlement basis.
- TFC used/remaining.
- Known exclusions.
- Adviser review questions.

### 7.3 Wording principles

Use plain-English labels first; technical terms can appear in helper text.

Prefer:

- "Tax-free cash"
- "Planned tax-free cash event"
- "When this pension first enters drawdown"
- "Already taken / no tax-free cash remaining"
- "Shown separately; not treated as ordinary income"

Avoid making the primary UI depend on:

- PCLS;
- UFPLS;
- crystallised/uncrystallised;
- RBCE;
- LSA/LSDBA.

Those terms can be documented or shown in advanced caveats, but they should not be the first layer of UI.

### 7.4 Validation and explanation

The UI should prevent or clearly warn about:

- amount and percentage both filled in;
- event date before pot valuation date, unless explicitly allowed as historical/prior-access data;
- percentage-based event amounts without a clearly defined base;
- event amount exceeding pot balance;
- event amount exceeding simplified estimated TFC remaining;
- duplicate event IDs on import;
- planned event references to a pot/source that no longer exists after rename/import/restore;
- destination inside the plan without an explicit target account;
- ISA/cash-account destinations where the app would imply allowance, contribution, or reinvestment treatment that is not actually modelled;
- ambiguous residual treatment after tax-free cash has been taken.

Warnings should name the pot and event in user-facing language, not internal IDs.

### 7.5 Visual model

A simple visual structure could be:

```text
Pension tax-free cash

SIPP
Current treatment: Gradual pro-rata with withdrawals
[Change]

If changed to planned events:

SIPP tax-free cash events
Date / timing                   Amount        Destination        Notes
Age 67 / Jan 2032               £50,000       Shown separately   Not taxed as income
When pot first enters drawdown  25% of TFC    Outside plan       Advanced timing rule

Estimated tax-free cash
Used in plan: £50,000
Remaining estimate: £25,000
Known exclusions: LSA/LSDBA, provider rules, MPAA not modelled
```

## 8. Workings and transparency requirements

Each projection year should be able to show:

- active ordinary drawdown stage(s);
- ordinary withdrawals by source;
- tax-free element from gradual ordinary withdrawals;
- explicit TFC events by pot;
- TFC events treated as separate capital/cash events, not ordinary income unless explicitly configured otherwise;
- taxable pension income;
- tax due;
- net income achieved;
- pot balance opening/closing;
- estimated TFC used and remaining;
- caveats/warnings.

The Year Workings modal should use structured projection data. It should not infer event logic from prose labels.

## 9. What If and apply-to-plan semantics

What If can compare alternative TFC/access strategies, but it should not become the live source of truth accidentally.

Recommended flow:

1. Base plan has applied pension access/TFC config.
2. What If creates temporary named scenarios.
3. A scenario may change event timing, amount, residual treatment, and drawdown stages.
4. Results compare tax, net income, pot longevity, and TFC used/remaining.
5. User must explicitly choose "Apply this strategy to plan" before Dashboard/current projection changes.

## 10. Data migration and compatibility

Migration from current configs:

- Missing `tax_free_cash` metadata becomes gradual pro-rata.
- Existing `tax_free_portion` remains the numerical basis for gradual pro-rata.
- Existing projection outputs must remain unchanged until explicit event behaviour is enabled.
- Old configs should not gain accidental TFC events.
- Existing placeholder upfront/event fields should either be ignored/stripped until the event engine exists, or migrated only through a deliberately tested compatibility path.
- Full-case import/export must preserve event IDs and notes once introduced.
- Import should detect duplicate event IDs and missing pot references deterministically, with user-facing repair/warning behaviour rather than silent reassignment.

## 11. Suggested implementation checkpoints

Checkpoint 0: Branch sync

- Fast-forward Dev02 to current main/Dev01 baseline.
- No functional changes.

Checkpoint 1: Design doc

- Agree this design direction.
- Refine UI flow and wording.
- Add adviser review questions.

Checkpoint 2: Types and validation only

- Add event-led config types.
- Add validation helpers and migration/normalisation.
- No projection output changes.

Checkpoint 3: Event resolver foundation

- Add a resolver that can produce internal pension access events.
- Represent current gradual pro-rata behaviour in structured output where possible.
- Prove existing outputs unchanged.

Checkpoint 4: Explicit TFC event engine

- Support planned TFC events.
- Reduce pot balance.
- Reduce estimated TFC remaining.
- Keep event separate from ordinary income.
- Add focused tests.

Checkpoint 5: Workings and summary data

- Add structured YearRow/access-event output.
- Add Year Workings display.
- Add compact Dashboard summary.

Checkpoint 6: Drawdown Order UI

- Add per-pot TFC/access event controls with progressive disclosure.
- Keep ordinary drawdown stages visually separate.

Checkpoint 7: What If scenarios

- Compare event schedules.
- Add explicit apply-to-plan flow later.

## 12. Adviser/user review questions

1. Is it clear that regular drawdown and tax-free cash events are separate decisions?
2. Is "gradual pro-rata with withdrawals" acceptable as the default simple treatment?
3. Do users/advisers need multiple planned tax-free cash events, or is one event enough for the first UI while the data model supports many?
4. Should a TFC event be allowed to occur before retirement date, or should that be advanced-only?
5. Is "when this pension first enters drawdown" a useful timing shortcut?
6. Should TFC events be shown as separate capital/cash events by default rather than ordinary income?
7. What caveat wording is acceptable for not modelling LSA/LSDBA, MPAA, emergency tax, provider constraints, and Isle of Man PFS-specific rules in the first ruleset?
8. Does the proposed UI structure feel clear enough for non-technical users?
9. For Isle of Man-resident users with UK pension pots, should the first implementation treat UK pension access rules and Isle of Man income-tax residence separately, or should Isle of Man PFS treatment only be selectable when the pot is explicitly marked as a PFS?

## 13. Open design questions

1. Should first-pass estimated entitlement be based on pot balance at event time, plan start, or a manually entered remaining TFC amount?
2. After explicit TFC events, should ordinary drawdown from the same pot default to taxable-only, continue gradual pro-rata on remaining entitlement, or require an explicit residual rule?
3. Should historical/prior TFC already taken be represented as events, opening state, or both?
4. Should event destinations inside the plan be supported in the first calculation phase, or should the first phase only show TFC separately/outside plan?
5. Should the UI allow multiple events immediately, or expose one event first while preserving array-based data underneath?
6. What is the deterministic within-month ordering when a TFC event and ordinary drawdown from the same pot fall in the same month?
7. Should event configs reference existing name-based source keys for compatibility, or introduce stable source IDs as part of the foundation checkpoint?

## 14. Recommended near-term decision

Proceed with the foundation-first approach:

- write/agree the event-led design;
- keep UI clarity as a first-class requirement;
- implement types/validation/migration before projection changes;
- preserve current gradual pro-rata outputs until explicit event behaviour is deliberately enabled;
- keep Dashboard read-only and Drawdown Order as the editor;
- add What If/apply-to-plan semantics only after the base model is coherent.
