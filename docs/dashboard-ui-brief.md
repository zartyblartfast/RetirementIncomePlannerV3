# Dashboard UI brief — answer-first slice

Project: RetirementIncomePlannerV3 (`demo` branch). Platform: desktop-first responsive web.
User: a person planning retirement income, sometimes with an adviser; returning experts need tax and annual workings.

## Primary job and flow
See whether the current projection meets its applicable income target/benchmark through the selected end age; understand any shortfall; explore a separate What If scenario without silently changing the current case.

1. Read a qualified outcome computed from the current projection.
2. Inspect achieved net income against the engine's annual target/benchmark on an age-axis chart, or use the annual table.
3. Open What If to compare a change, or expand the existing controls and workings.

## First screen
Outcome and large income chart dominate. Strategy, relevant target/benchmark, plan end age and tax-rule context are visible. One primary next action leads to the existing What If route. Existing inputs, detailed capital/income charts and verification remain reachable below rather than being deleted. Retain all existing plan values, tax assumptions and local case semantics; no new defaults or calculated claims.

## Boundaries
- The engine's `summary.first_shortfall_age`, `summary.end_age` and `years` are the sources of truth. `summary.sustainable` is a modelled projection, not a guarantee; ARVA has a documented late-shortfall tolerance, so do not derive a contradictory headline by rescanning rows.
- For portfolio-driven strategies, `target_income.net_annual` is a separate planning benchmark, not a withdrawal target. The chart's `YearRow.target_net` follows the strategy-derived annual spending estimate, **not** that planning benchmark; label the comparison and outcome accordingly. For income-target strategies, display the active strategy parameter rather than a stale config fallback.
- A pot depletion is a milestone, not automatically a warning. Keep actual engine warnings visible and separate.
- The chart and outcome must not use illustrative data in the live app. Never silently mutate the Current Plan from the dashboard's main action.
- Retain keyboard-focus visibility, labels, annual table, tax workings and current import/export.

## Visual direction
Retain existing fonts, palette and Tailwind tokens; restrained surface with no new design dependency. Outcome first, one explanatory chart, then context and controls. Desktop chart width is primary; narrow screens stack content.

## Acceptance
First-time/returning/edge scenarios: read outcome, navigate to What If, open configuration and annual workings, observe warning state, and reach records by keyboard. Verify build/tests and rendered page at desktop and narrow widths; report anything not covered.
