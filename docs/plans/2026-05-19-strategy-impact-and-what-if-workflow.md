# Strategy Impact and What If Workflow Plan

> **For Hermes:** Use this plan before implementing further Strategy / What If drawdown-stage comparison work. Implement in small, test-first checkpoints and do not commit/push without explicit approval.

**Goal:** Let users author a drawdown strategy, see its impact, and keep What If powerful without turning it into a chaotic duplicate strategy editor.

**Architecture:** The Strategy page owns strategy structure: drawdown stages/order/blending and planned pension-access/TFC events. The What If page consumes the selected Current Plan strategy as its baseline and compares saved scenario snapshots using controlled levers. Dashboard remains the read-only Current Plan output; Review remains actuals/re-baseline.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, localStorage-backed config/scenario stores.

---

## Product workflow

### 1. Dashboard: Current Plan output

Dashboard should answer:

- What does the Current Plan shown on the Dashboard produce?
- What income/capital/tax trajectory follows from the currently selected Strategy?

Dashboard should not become the strategy editor.

### 2. Strategy: author and assess strategy structure

Strategy should answer:

- Which ordinary drawdown sources are used first?
- Are sources used sequentially or blended inside stages?
- What planned pension-access/TFC events are part of the future plan?
- What is the projected impact of this strategy compared with common alternatives?

Strategy page sections should become:

1. Current strategy editor
   - Income strategy / target or benchmark.
   - Drawdown order and blending stage editor.
   - Planned pension access / TFC events.

2. Current strategy summary
   - Explicitly state that changes apply automatically to the Current Plan shown on the Dashboard.
   - Example copy:
     - `Changes here update the Current Plan strategy automatically. No separate apply step is needed.`
     - `Current strategy: Stage 1 blends DC Pot A 50.0% + DC Pot B 50.0%; Stage 2 uses ISA 100.0%.`

3. Strategy Impact Comparison
   - Evolution of the old Drawdown Order Analysis table.
   - Compare the current user-authored strategy with common sequential and blended alternatives.
   - Avoid wording that implies regulated advice or black-box optimisation.
   - Preferred framing: `Compare common source-order and blending patterns`.

### 3. What If: scenario comparison, not full strategy authoring

What If should answer:

- Given the Current Plan strategy, what happens if key assumptions change?
- How do saved scenarios compare in Stress Test and Shootout?

What If should take the selected Strategy page rules as its baseline. It should not duplicate the full drawdown-stage/blending editor.

Allowed What If levers should remain deliberately controlled, for example:

- retirement timing;
- target income / planning benchmark;
- growth/stress assumptions;
- narrow TFC scenario lever;
- saved scenario selection.

Possible later addition, only if needed:

- a simple `Strategy basis` selector:
  - `Use Current Plan strategy`;
  - `Use saved strategy scenario: [name]`;
  - `Use simple preset: Sequential / Blend DC pots / Blend all flexible sources`.

Do not expose every stage/source/share control on What If unless explicitly reprioritised.

### 4. Saved What If scenarios

Saved scenarios should preserve the full scenario config snapshot, including:

- drawdown strategy;
- drawdown strategy params;
- target income / planning benchmark;
- withdrawal priority legacy mirror;
- drawdown stages/blending;
- pension-access/TFC events;
- stress/growth assumptions captured in the scenario config.

This preserves the power of Stress Test and Shootout: they compare complete scenario snapshots, while the page UI remains understandable.

### 5. Review: actuals and re-baseline

Review should continue to handle:

- actual pot balances;
- actual income drawn;
- actual pension-access/TFC taken;
- baseline/re-baseline comparison.

Review should detect strategy changes, but it should not be where future strategy structures are authored.

---

## Strategy Impact Comparison design

Rename/reframe the old `Drawdown Order Analysis` as:

- `Strategy Impact Comparison`

Purpose:

- show the impact of the current strategy and common alternatives;
- make manual staged/blended changes understandable;
- provide an explicit action when the user wants to adopt an analysed alternative.

### Rows to compare initially

Keep first implementation small and deterministic.

Suggested initial rows:

1. `Current strategy`
   - exactly the current user-authored `drawdown_stages` and `pension_access_events`.

2. Sequential alternatives
   - each eligible source as one 100% stage, using selected permutations where the number of sources is manageable.
   - If too many sources exist, cap the comparison or use clear presets rather than generating a huge table.

3. Simple blended alternatives
   - `Blend DC pensions first, then tax-free accounts`.
   - `Tax-free accounts first, then blend DC pensions`.
   - `Equal blend all flexible sources`.

4. Optional later rows
   - saved strategy patterns;
   - adviser-reviewed presets;
   - tax-aware suggestions, only if explicitly built and labelled as suggestions rather than advice.

### Columns to show

Minimum useful columns:

- strategy pattern name;
- source rule summary;
- sustainable yes/no;
- first shortfall age;
- remaining capital;
- total tax;
- first depleted source and age;
- income shortfall years.

Optional later columns:

- average effective tax rate;
- total ordinary DC gross withdrawals;
- total pension-access/TFC capital events;
- lowest capital buffer;
- notes/caveats.

### Row actions

For generated alternatives:

- `Use Selected Strategy in Current Plan`

This action should copy only strategy fields into the Current Plan:

- `drawdown_strategy`;
- `drawdown_strategy_params`;
- `target_income`;
- `withdrawal_priority`;
- `drawdown_stages`;
- `pension_access_events` if the compared row includes planned TFC events.

It must preserve:

- fund values;
- tax settings;
- income sources;
- Review history;
- saved scenarios.

For the `Current strategy` row:

- no apply action is needed;
- label it clearly as already active.

---

## Implementation checkpoints

### Checkpoint 1: copy-only UX clarity on Strategy

**Objective:** Make it obvious that stage edits are live Current Plan edits.

Files likely touched:

- `src/components/dashboard/drawdownStageSummary.tsx`
- `src/components/dashboard/__tests__/drawdownStageSummaryEditor.test.tsx`

Tests first:

- assert the editor displays copy stating changes apply automatically to the Current Plan shown on the Dashboard;
- assert the rendered summary updates after adding a second source to Stage 1;
- assert the summary says `blends` or `Blended stage` when a stage has multiple sources.

No engine behaviour change.

### Checkpoint 2: extract strategy comparison candidates

**Objective:** Generate deterministic comparison candidates from the Current Plan without touching UI.

Likely new file:

- `src/engine/strategyComparison.ts`

Likely test file:

- `src/engine/__tests__/strategyComparison.test.ts`

Tests first:

- current strategy candidate preserves existing `drawdown_stages`;
- sequential candidate rebuilds one-source stages and syncs `withdrawal_priority`;
- DC-blend-first candidate creates one blended DC stage followed by other sources;
- candidate generation is capped or labelled when many sources exist;
- generated candidates do not mutate the input config.

### Checkpoint 3: evaluate candidates against projection

**Objective:** Produce table-ready metrics for each candidate.

Likely files:

- `src/engine/strategyComparison.ts`
- `src/engine/__tests__/strategyComparison.test.ts`

Metrics:

- sustainable;
- first shortfall age;
- remaining capital;
- total tax;
- first depleted source/age;
- income shortfall years.

Tests first:

- candidate metrics match direct `runProjection(candidate.config)` output;
- blended candidate evaluates with matching `drawdown_stages`, not stale `withdrawal_priority`;
- pension-access/TFC capital events affect capital metrics but not ordinary income/tax metrics.

### Checkpoint 4: replace/reframe Strategy analysis table UI

**Objective:** Rename old Drawdown Order Analysis to Strategy Impact Comparison and show current/sequential/blended rows.

Likely files:

- `src/pages/Optimise.tsx`
- possibly new component `src/components/strategy/StrategyImpactComparison.tsx`
- UI tests under `src/components/strategy/__tests__/`

Tests first:

- table heading is `Strategy Impact Comparison`;
- current strategy row appears and is labelled already active;
- blended alternative rows appear when multiple DC pots exist;
- selecting a generated row enables `Use Selected Strategy in Current Plan`;
- applying selected row updates `drawdown_stages` and legacy `withdrawal_priority` together.

### Checkpoint 5: confirm What If consumes strategy snapshots cleanly

**Objective:** Keep What If powerful but scoped.

Likely files:

- `src/pages/WhatIf.tsx` or existing What If components;
- `src/store/scenarioStore.ts` if needed;
- `src/components/whatif/__tests__/...`

Tests first:

- sandbox starts from the Current Plan strategy fields;
- saving a scenario preserves `drawdown_stages` and `pension_access_events` in the scenario snapshot;
- Shootout/Stress Test evaluate each saved scenario's strategy snapshot;
- What If promotion continues to copy only scoped strategy fields via `Update Current Plan`;
- What If does not expose or require the full stage editor.

### Checkpoint 6: browser smoke and wording pass

**Objective:** Verify the whole user journey.

Manual smoke path:

1. Add two DC pots into Stage 1 on Strategy.
2. Confirm the page says the Current Plan is updated automatically.
3. Confirm summary shows Stage 1 as a blend.
4. Confirm Strategy Impact Comparison shows Current strategy plus alternatives.
5. Select a generated alternative and update Current Plan.
6. Go to Dashboard and confirm Current Plan output reflects selected strategy.
7. Go to What If and confirm it starts from the Current Plan strategy.
8. Save two scenarios and confirm Shootout/Stress Test still compare them.

Verification commands before commit:

```bash
npx vitest run --config vitest.config.ts
npx tsc -b
npm run build
```

Revert generated `tsconfig.*.tsbuildinfo` after checks.

---

## Wording guardrails

Preferred wording:

- `Retirement Income Strategy`
- `Current Plan shown on the Dashboard`
- `Update Current Plan`
- `Strategy Impact Comparison`
- `Compare common source-order and blending patterns`

Avoid:

- `Apply to Dashboard`
- `best strategy`
- `optimised recommendation`
- `tax-aware optimisation` unless a specifically tested feature exists
- implying the app is giving regulated advice.

---

## Open decisions before implementation

1. Should Strategy Impact Comparison include TFC event variants immediately, or only preserve the current planned TFC events in each candidate for now?
2. How many sequential permutations should be shown before the table becomes noisy?
3. Should saved What If scenarios be shown as selectable strategy-basis rows on Strategy, or remain only on What If/Shootout initially?
4. Should `Current strategy` comparison use a previous baseline snapshot for impact delta, or just compare against generated alternatives?
5. Which metric should be the default sort: remaining capital, sustainability, first shortfall age, or user-selected?

Initial recommendation:

- preserve current planned TFC events across candidates;
- compare only common source-order/blend patterns first;
- leave saved scenario comparisons on What If/Shootout;
- do not add baseline deltas yet;
- sort current strategy first, then generated patterns, not by a hidden best score.
