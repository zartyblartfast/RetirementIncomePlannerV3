# Tax Rule-Pack Architecture Groundwork Plan

**Goal:** Make the tax-pack strategy immediately obvious to future developers: new jurisdictions and tax years should be added or updated as versioned, self-documenting tax rule packs wherever possible, without changing core projection logic.

**Architecture:** The projection engine should remain jurisdiction-neutral. It should emit income/taxable-event information; the tax module should apply the selected rule pack and return standard tax results, warnings, assumptions, and explanation metadata. Tax packs are not arbitrary plugins: they are structured, reviewable rule definitions using calculation patterns explicitly supported by the app.

**Tech Stack:** TypeScript, existing projection engine, existing tax engine, Vitest compatibility tests, markdown design docs.

---

## Objective

The objective is to support tax jurisdiction and tax-year changes without scattering jurisdiction-specific code through the projection engine.

A future developer should be able to add or update a supported tax pack such as:

- `IM-2027-28`
- `GB-EWNI-2027-28`
- `GB-SCT-2027-28`
- future supported jurisdictions

by updating structured tax-pack data, metadata, source references, worked examples, and tests, rather than editing `projection.ts` or adding ad-hoc jurisdiction branches throughout the app.

## Core Design Statement

```text
Projection engine = what happened financially.
Tax module       = how those events are taxed.
Tax pack         = reviewed jurisdiction/year rules and metadata.
```

The projection engine should produce neutral information such as:

- guaranteed income;
- DC pension gross withdrawal;
- DC pension taxable portion;
- DC pension tax-free portion;
- tax-free account withdrawal;
- source names and dates;
- relevant tax year or projection period.

The tax module should decide, based on the selected rule pack, how those amounts are taxed.

## Non-Goal: Plugin System

Tax packs are not intended to be a general plugin mechanism.

A plugin system would imply arbitrary executable logic loaded into the app. That would make the app harder to test, harder to review, and riskier for a financial planning tool.

The intended model is:

```text
structured rule data + documented assumptions + source links + worked examples + automated tests
```

Where a tax rule cannot be represented as simple data, the core app may later add an explicitly supported calculation pattern or a reviewed first-party tax module. That is different from allowing arbitrary third-party code to run as a plugin.

## Desired Developer Workflow

When adding a new tax year for an already-supported simple-banded jurisdiction:

1. Add a new tax-pack id rather than mutating the old one, for example `IM-2027-28`.
2. Copy the prior pack only as a starting point.
3. Update allowances, bands, caps, effective dates, and source URLs from official sources.
4. Update `lastChecked` and rule summary metadata.
5. Record known exclusions and review status.
6. Add or update worked examples.
7. Add or update automated tests.
8. Run tax tests, projection compatibility tests, full Vitest, TypeScript, and build.
9. Update adviser-facing docs if assumptions, exclusions, or wording changed.

When adding a structurally new jurisdiction:

1. First decide whether the existing supported calculation patterns can represent it.
2. If yes, add a structured pack and tests.
3. If no, design a new explicit tax-module capability before adding the jurisdiction.
4. Preserve current projection behaviour with compatibility tests before refactoring.
5. Do not add jurisdiction-specific shortcuts to `projection.ts`.

## Compatibility Test Requirement

Before refactoring tax internals, freeze current behaviour with tests covering:

- custom simple tax config;
- UK England/Wales/Northern Ireland pack;
- UK Scotland pack;
- Isle of Man pack;
- allowance taper cases;
- optional tax-cap cases;
- mixed guaranteed income, DC drawdown, and tax-free withdrawals;
- `YearRow` tax fields used by dashboard tables, charts, Review, and Year Workings.

Equivalent rules should match current outputs within rounding. Intentional differences must be documented and linked to a spec/adviser decision.

## Implementation Sequence

### Task 1: Make the strategy visible in docs

**Objective:** Ensure future developers see the tax-pack strategy before touching tax code.

**Files:**

- Modify: `docs/tax-architecture-roadmap.md`
- Modify: `docs/tax-rule-packs.md`
- Create: `docs/plans/tax-rule-pack-architecture-groundwork.md`

**Verification:**

- A future developer can answer: "Do I add a tax pack or change the projection engine?"
- The docs clearly state that tax packs are structured rule definitions, not arbitrary plugins.

### Task 2: Add compatibility baselines before refactor

**Objective:** Protect current tax outputs before changing architecture.

**Files:**

- Add or update tests under `src/engine/__tests__/`.

**Verification commands:**

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/tax.test.ts src/engine/__tests__/iomWorkedExamples.test.ts
npx vitest run --config vitest.config.ts
npx tsc -b
npm run build
```

### Task 3: Introduce tax event types without changing output

**Objective:** Define neutral income/taxable-event types while keeping existing `calculateTax()` behaviour unchanged.

**Files:**

- Likely create: `src/engine/taxEvents.ts`
- Likely modify: `src/engine/types.ts`

**Verification:**

- TypeScript passes.
- All existing tests pass.
- Projection outputs remain unchanged.

### Task 4: Add adapter from current annual projection data to tax events

**Objective:** Start moving toward event-based tax calculation without altering results.

**Files:**

- Likely create: `src/engine/taxEventAdapter.ts`
- Add tests for adapter output.

**Verification:**

- Adapter tests show guaranteed income, DC taxable/tax-free portions, and tax-free withdrawals are represented correctly.
- Existing projection results remain unchanged.

### Task 5: Wrap current banded logic as the first tax module

**Objective:** Make the current simple banded tax implementation look like a formal module while preserving behaviour.

**Files:**

- Likely modify: `src/engine/tax.ts`
- Likely modify: `src/engine/taxRulePacks.ts`

**Verification:**

- Existing tax tests pass.
- Compatibility tests confirm no unintended changes.

## Developer Guardrails

- Do not add jurisdiction branches to `projection.ts`.
- Do not mutate old tax-year packs silently; add a new versioned pack.
- Do not claim adviser approval unless review status has actually been updated.
- Do not hide known exclusions.
- Do not add arbitrary plugin execution for tax packs.
- Do not weaken existing worked-example or internal-consistency tests to make a refactor pass.

## Definition Of Done For Phase 7 Groundwork

- Tax-pack strategy is explicit in docs.
- Compatibility-test list is agreed before refactoring.
- Future developers know that tax packs are structured, versioned, reviewed rule definitions.
- Future developers know that projection remains jurisdiction-neutral.
- No app outputs change in the groundwork phase unless separately approved.
