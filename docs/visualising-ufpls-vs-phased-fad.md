# Visualising UFPLS vs Phased FAD

Status: idea note / design exploration for future UI. Not an implementation spec yet.

Purpose: capture a promising visual language for the two primary pension drawdown engines before building production UI.

## Decision-level idea

Use the same three-container visual language for both engines, but give each engine a different flow pattern:

1. **UFPLS = The Split**
   - One transaction.
   - Uncrystallised fund splits immediately into tax-free cash, taxable pension income, tax, and net amount.
   - The crystallised container is only a transient “flash frame”, not a persistent pot.

2. **Phased FAD = The Timeline**
   - Multi-year plan.
   - Uncrystallised fund is gradually crystallised in slices.
   - PCLS moves to the user as tax-free capital.
   - The remaining crystallised drawdown pot persists, grows, and funds taxable income over time.

This matches the product framing: UFPLS and Phased FAD are the two drawdown engines, while full crystallisation is a warning/comparison column rather than a normal strategy.

## Shared three containers

Both visuals use the same three conceptual containers:

```text
┌────────────────┐    ┌────────────────────┐    ┌──────────────────┐
│ Uncrystallised │    │ Crystallised       │    │ User / bank      │
│ pension fund   │    │ drawdown pot       │    │ net cash/income  │
└────────────────┘    └────────────────────┘    └──────────────────┘
```

Shared colour language:

| Colour | Meaning |
| --- | --- |
| Green | Tax-free cash / PCLS / tax-free UFPLS element |
| Blue | Taxable pension income or crystallised drawdown funds |
| Red / amber | Tax, warning, MPAA trigger, emergency-tax issue |
| Grey | Remaining pension capital / unavailable / unmodelled destination |

## Visual A: UFPLS — “The Split”

### User question

> If I take £X now, what do I actually receive, what tax is due, and what warnings apply?

### Shape

Single-frame or short animation:

```text
Uncrystallised pension fund
        │
        ▼
UFPLS payment requested
        │
        ├── 25% tax-free element ───────────────► user
        │
        └── 75% taxable element ──► tax ────────► net to user
```

The crystallised container can appear briefly only to explain the 25/75 split, but should not persist as a pot. That helps avoid confusing UFPLS with FAD.

### Good UI outputs

- Requested UFPLS amount.
- Tax-free element.
- Taxable element.
- Estimated tax under normal calculation.
- Emergency-tax / P55 warning.
- MPAA trigger warning.
- Remaining uncrystallised pension fund.
- LSA caveat / used tax-free lump sum amount.

### Best placement

A future **UFPLS calculator/planner** panel.

Good first version:

- one-off UFPLS amount;
- optional recurring annual/monthly UFPLS later;
- warning-first UI before users treat it as “just a withdrawal”.

## Visual B: Phased FAD — “The Timeline”

### User question

> How should I crystallise and draw over the next several years to fund retirement income tax-efficiently?

### Shape

Timeline / scrubber view:

```text
Year 1
Uncrystallised fund ── crystallise slice ──► PCLS to user
                                      └──► crystallised drawdown pot
                                                   └── taxable income to user

Year 2
Uncrystallised fund ── crystallise next slice ──► PCLS to user
                                           └──► crystallised drawdown pot grows / is drawn
```

The crystallised drawdown pot is the star of this view. It persists over time, receives the 75% remainder from crystallisation slices, grows with investment returns, and is depleted by taxable FAD income.

### Good UI outputs

- Annual crystallisation amount.
- PCLS / tax-free cash released each year.
- Crystallised drawdown balance before/after.
- Taxable FAD income drawn.
- Tax due.
- MPAA status and trigger year.
- Remaining uncrystallised balance.
- LSA caveat / remaining headroom.
- Tax-band utilisation, especially personal allowance and basic-rate band.

### Best placement

A future **Pension Access Planner** or Strategy sub-panel.

Good first version:

- annual tax-year rows;
- one selected pension pot;
- compare “PCLS-only”, “PCLS + taxable FAD”, and “full crystallisation warning”;
- link into the existing Year Table/workings rather than duplicating all calculations.

## The high-value interaction: toggle comparison

A powerful early prototype could let the user enter the same desired amount and flip between UFPLS and Phased FAD:

```text
I want: £20,000 from this pension pot this tax year

[ UFPLS ]        [ Phased FAD ]        [ Full crystallisation warning ]
```

The containers stay in the same positions, but the flow changes:

| Area | UFPLS | Phased FAD |
| --- | --- | --- |
| Uncrystallised fund | Direct subtraction | Crystallisation slice |
| Crystallised pot | Transient / skipped | Persistent balance |
| Tax-free amount | 25% of UFPLS payment | PCLS from crystallised slice |
| Taxable amount | 75% of UFPLS payment | FAD income drawn from crystallised pot |
| MPAA | Triggered on first UFPLS | Triggered only when taxable FAD income starts |
| Emergency tax | Prominent warning | Warning if first taxable pension drawdown payment applies |

This toggle could be more useful than many extra worked examples because it makes the strategy difference visible in one place.

## Tax-efficiency visual ideas

Potential overlays:

1. **Personal allowance meter**
   - Shows how much of the personal allowance is used by State Pension / other income before pension drawdown.

2. **Basic-rate band meter**
   - Shows whether taxable pension income stays within the basic-rate band.

3. **Tax-free entitlement preservation meter**
   - Shows uncrystallised balance retaining future 25% PCLS entitlement.

4. **MPAA status badge**
   - “Not triggered”, “Would trigger this year”, or “Already triggered”.

5. **Full-crystallisation warning column**
   - Shows what happens if too much is crystallised early: loss of future tax-free growth entitlement and potentially less planning flexibility.

## What not to build first

Avoid starting with:

- a polished animation-heavy component;
- a recommendation engine that claims the best strategy;
- annuity/hybrid graphics inside the same drawdown visual;
- death-benefit/IHT diagrams;
- full multi-pot/multi-provider complexity.

First goal should be comprehension, not optimisation.

## Recommended prototype sequence

1. Create disposable HTML sketches, not production React.
2. Sketch two variants:
   - UFPLS split card.
   - Phased FAD timeline card.
3. Add the toggle comparison as a third combined sketch if the first two work.
4. Review visually with adviser-demo goals in mind.
5. Only then convert the winning pattern into production UI.

Suggested sketch path:

```text
sketches/pension-access-visuals/
  ufpls-split/index.html
  phased-fad-timeline/index.html
  strategy-toggle-comparison/index.html
```

## Adviser demo use

For the current adviser demo, this should stay as an idea unless a quick sketch is useful. The verbal framing is enough:

> We are thinking of showing UFPLS as a split transaction and Phased FAD as a multi-year timeline, using the same fund / crystallised pot / user-income containers. Does that match how you explain the choice to clients?
