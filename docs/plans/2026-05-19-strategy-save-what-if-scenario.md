# Strategy Save as What If Scenario Implementation Plan

> **For Hermes:** Implement directly unless the change expands beyond the Strategy page, scenario store, and focused tests.

**Goal:** Allow a selected Strategy Impact Comparison row to be saved as a named What If scenario without changing the Current Plan.

**Architecture:** The Strategy page already evaluates each representative source pattern as a full `PlannerConfig` candidate. Reuse that candidate config as the scenario snapshot and persist it through the existing localStorage-backed `scenarioStore`. Keep `Update Current Plan` separate from `Save as What If Scenario` so users can preserve strategy variants without promoting them to the Dashboard.

**Tech Stack:** React 18, TypeScript, Vitest/happy-dom, existing `scenarioStore`.

---

### Task 1: Add Strategy-page scenario save action

**Objective:** Add a secondary action for the selected comparison row that saves the selected candidate to What If scenarios.

**Files:**
- Modify: `src/pages/Optimise.tsx`

**Steps:**
1. Import `Save` icon and `saveScenario`.
2. Derive a clear default scenario name from the active income rule and selected row label.
3. Add `handleSaveSelectedScenario()`:
   - find selected row;
   - prompt for a scenario name using the default;
   - abort on cancel/blank name;
   - call `saveScenario(name, selected.config)`;
   - show an inline confirmation message.
4. Add a secondary button beside `Update Current Plan`: `Save as What If Scenario`.
5. Add helper copy that saving does not change the Current Plan.

### Task 2: Protect behaviour with Strategy-page tests

**Objective:** Verify the new workflow saves a scenario and does not mutate Current Plan.

**Files:**
- Modify: `src/pages/__tests__/Optimise.test.tsx`

**Steps:**
1. Clear localStorage between tests.
2. Mock `window.prompt` to return a deterministic scenario name.
3. Select a representative row.
4. Click `Save as What If Scenario`.
5. Assert:
   - confirmation text appears;
   - one What If scenario exists;
   - scenario name matches prompt;
   - scenario config carries selected `drawdown_stages`;
   - live Current Plan config is unchanged.

### Task 3: Verify

**Commands:**
- `npx vitest run --config vitest.config.ts src/pages/__tests__/Optimise.test.tsx src/store/__tests__/scenarioStore.test.ts`
- `npx vitest run --config vitest.config.ts`
- `npx tsc -b`
- `npm run build`

**Post-check:** Revert generated `tsconfig.*.tsbuildinfo` if touched. Do not commit or push without approval.
