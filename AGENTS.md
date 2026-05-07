# Retirement Income Planner V3 — Agent Instructions

## Project purpose

Retirement Income Planner V3 is a local-first personal finance planning app for modelling retirement income, pension drawdown, ISA usage, tax, and year-by-year projection outcomes.

The app is intended to become professional-grade enough for discussion with IFAs, so calculation transparency, auditability, and user trust are more important than cleverness or hidden assumptions.

Primary stack:

- React 18
- TypeScript
- Vite
- TailwindCSS
- Recharts
- Vitest
- Netlify deployment

Repository root:

- `/root/RetirementIncomePlannerV3`

## Non-negotiable safety and workflow rules

1. Do not commit any file unless the user has first been shown the diff and explicitly agrees to commit.
2. Do not push to any remote unless the user explicitly asks.
3. Do not add external services, telemetry, analytics, hosted databases, or cloud persistence without explicit user approval.
4. Treat user financial data as local-only. Do not design features that upload, sync, transmit, or persist user data outside the browser/local file workflow unless explicitly requested.
5. Prefer small, reviewable changes over broad rewrites.
6. Do not silently change financial assumptions, tax rules, default values, or engine behaviour.
7. When changing calculation logic, add or update tests before considering the task complete.
8. Preserve calculation transparency: if a result changes, the workings/explanation path should remain understandable to the user.
9. Avoid scope creep. Implement the requested change and only closely necessary supporting changes.
10. If uncertain about a financial/tax assumption, stop and ask rather than guessing.

## Local-only user data constraint

The app must remain local-first.

User configuration and financial data should stay in:

- browser localStorage
- user-imported/exported config files
- in-memory app state

Do not introduce:

- server-side user accounts
- remote persistence
- analytics events containing financial details
- third-party sync
- backend storage
- API calls that transmit user financial configuration

Any proposal that changes this constraint requires explicit user approval.

## How to run checks

Use these commands from the repo root.

Install dependencies:

```bash
npm install
```

Run the test suite:

```bash
npm test
```

Equivalent non-interactive test command:

```bash
npx vitest run --config vitest.config.ts
```

Run TypeScript checks:

```bash
npx tsc -b
```

Build production bundle:

```bash
npm run build
```

Current expected baseline:

- Vitest: about 194 tests passing
- TypeScript: 0 errors

If this baseline changes legitimately, update this file in the same diff.

Important config convention:

- `vite.config.ts` is for Vite build/PWA config.
- `vitest.config.ts` is for Vitest test config.
- Do not merge these back into one file. The split avoids Vite/Vitest plugin type conflicts.

## Commands to avoid

Do not use development-server commands unless explicitly needed. Prefer tests, type-checks, and builds.

Avoid:

```bash
npm run dev
```

This repo has historically used non-interactive checks instead of starting long-running development servers during agent work.

## Monthly simulation engine rules

The projection engine is year-row/month-aware financial modelling code. Treat it as financial calculation infrastructure, not ordinary UI plumbing.

When working on the engine:

1. Preserve deterministic behaviour.
2. Do not introduce hidden randomness.
3. Do not round internally unless existing code already does so for a specific reason.
4. Keep display formatting separate from calculation logic.
5. Keep tax calculation logic in the tax engine; do not duplicate tax calculations in UI/workings helpers.
6. Do not call `calculateTax()` inside workings helpers; use the year row's existing `tax_breakdown`.
7. Preserve the meaning of `YearRow`, `PotPnl`, `TaxResult`, withdrawal detail, guaranteed income, DC pension, and tax-free account outputs.
8. If changing withdrawal ordering, growth, fees, tax treatment, or pot balance transitions, add regression tests and update any golden/fixture expectations deliberately.
9. Explain any material calculation change in plain English in the PR/commit notes or task summary.

Important files:

- `src/engine/projection.ts`
- `src/engine/tax.ts`
- `src/engine/types.ts`
- `src/engine/data/`
- `src/engine/__tests__/`
- `src/engine/__tests__/golden/`

## QA Gold harness and verification expectations

The app values "gold-plated" transparency: users should be able to inspect how results were derived.

When modifying calculations, tables, charts, or dashboard outputs:

1. Run the engine/unit tests.
2. Run TypeScript checks.
3. If UI-facing, run a production build.
4. Verify that explanation/workings components still make sense.
5. Update or add tests for any new calculation behaviour.
6. Do not remove sanity checks, workings modals, verification panels, or explanatory fields unless explicitly requested.

Relevant transparency areas include:

- `VerificationPanel`
- `YearWorkingsModal`
- `YearTable`
- sanity checks
- workings helpers
- golden tests and fixtures

If an output changes, the test update should show that the change is intentional, not accidental.

## UK and Isle of Man tax/pension assumptions

This project involves UK pension and tax-residency-sensitive retirement planning, including Isle of Man considerations.

Rules:

1. Do not guess current tax rates, pension allowances, or State Pension figures.
2. Use official sources for tax-year updates.
3. Keep default values and fixture values separate.
4. Test fixtures may intentionally use fictional values. Do not "correct" fixtures to real-world tax values unless the test itself is being redesigned.
5. Clearly label known limitations rather than silently modelling unsupported tax behaviour.

Official source examples:

- https://www.gov.uk/income-tax-rates
- https://www.gov.uk/individual-savings-accounts
- https://www.gov.uk/state-pension
- https://www.gov.uk/tax-on-your-private-pension/annual-allowance

## Code style and implementation preferences

1. Use TypeScript strictness correctly.
2. Remember that `noUncheckedIndexedAccess` is enabled: `array[index]` may be undefined.
3. Guard array access before spreading or dereferencing.
4. Prefer pure functions for financial logic.
5. Keep React components focused on presentation and user interaction.
6. Avoid circular imports, especially between workings, sanity checks, backtest, and growth suggestion modules.
7. Prefer explicit names over terse clever code.
8. Keep changes easy to audit.

Known pitfall:

- Do not import `backtest.ts` or `growthSuggestions.ts` from `workings.ts` or `sanityChecks.ts`.

## Testing expectations for agents

For any non-trivial code change, complete at least:

```bash
npm test
npx tsc -b
```

For UI/build-affecting changes, also run:

```bash
npm run build
```

If tests fail:

1. Identify the root cause.
2. Do not paper over failures by weakening tests.
3. If expected outputs changed because of intentional logic changes, explain why.
4. Keep a clear summary of changed files and verification commands.

## Diff and commit rule

Before any commit:

1. Run relevant checks.
2. Show the user:

```bash
git status --short
git diff --stat
git diff
```

3. Wait for explicit user approval.
4. Only then commit.
5. Do not push unless explicitly instructed.

Suggested commit message style:

- `feat: add ...`
- `fix: correct ...`
- `test: cover ...`
- `refactor: simplify ...`
- `docs: update ...`
- `chore: update ...`

## Documentation expectations

When adding or changing features:

1. Update README/docs only if the user-facing behaviour or setup process changes.
2. Keep docs accurate and concise.
3. Do not create large speculative plans unless asked.
4. If creating a plan, put it under `docs/plans/` and make clear that it is docs-only.

## Agent handoff notes

Agents should start by inspecting:

```bash
git status --short
npm test
npx tsc -b
```

For UI changes, inspect the relevant component and build before reporting completion.

Useful project paths:

- `src/store/configStore.ts`
- `src/store/ConfigProvider.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/dashboard/ConfigPanel.tsx`
- `src/components/dashboard/YearTable.tsx`
- `src/components/dashboard/VerificationPanel.tsx`
- `src/components/dashboard/YearWorkingsModal.tsx`
- `src/engine/projection.ts`
- `src/engine/tax.ts`
- `src/engine/types.ts`

Final agent response should include:

- What changed
- Files changed
- Tests/checks run
- Any assumptions made
- Any risks or follow-up items
- Confirmation that no commit/push was made unless explicitly approved
