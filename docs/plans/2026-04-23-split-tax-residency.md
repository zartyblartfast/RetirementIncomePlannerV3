# Split Tax Residency Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Allow users to configure a split tax residency — where different income streams are taxed
in different jurisdictions (e.g. UK State Pension claimed under UK-IoM DTA, DC drawdowns taxed
under Isle of Man rules) — and have the projection engine compute tax correctly across both regimes.

**Architecture:**
Each `GuaranteedIncomeConfig` entry gets an optional `tax_jurisdiction` field ('UK' | 'IoM' | custom).
The `PlannerConfig` gains a second optional `tax_secondary` TaxConfig for the non-primary jurisdiction.
The projection engine runs two separate annual tax calculations — one per jurisdiction — and sums them.
The UI gains a "Tax Residency" section in ConfigPanel and a jurisdiction selector per guaranteed income.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, TailwindCSS, shadcn/ui

**Source of truth — DTA (SI 2018/1347, in force 6 April 2019):**
- Private pensions / DC drawdowns: taxed ONLY in country of residence (IoM rules apply)
- Government-service pensions (civil service, NHS, military etc.): taxed ONLY in UK (DTA Art. 18)
- UK State Pension: taxed in country of residence under DTA (IoM rules apply, but requires
  active HMRC claim — user must arrange NT coding notice)
- ISA withdrawals: tax-free in both jurisdictions regardless
- IoM tax rates 2025/26: 10% on first IMP 6,500 / 21% above, personal allowance IMP 17,000
- UK tax rates 2024/25: 20% basic / 40% higher, personal allowance £12,570

**IMPORTANT DISCLAIMER to display in UI:**
"The 25% tax-free cash (PCLS) treatment for IoM residents drawing from UK pension schemes
is not definitively settled — seek specialist cross-border pension tax advice before relying
on these projections."

---

## Phase 1 — Type System and Engine

### Task 1: Add `tax_jurisdiction` to GuaranteedIncomeConfig

**Objective:** Allow each guaranteed income stream to declare which jurisdiction taxes it.

**Files:**
- Modify: `src/engine/types.ts`

**Step 1: Write failing test**

In `src/engine/__tests__/projection.test.ts`, add:

```typescript
it('GuaranteedIncomeConfig accepts tax_jurisdiction field', () => {
  const gi: GuaranteedIncomeConfig = {
    name: 'State Pension',
    gross_annual: 11500,
    indexation_rate: 0.025,
    start_date: '2032-01',
    end_date: null,
    taxable: true,
    values_as_of: '2025-01',
    tax_jurisdiction: 'IoM',
  };
  expect(gi.tax_jurisdiction).toBe('IoM');
});
```

**Step 2: Run — expect TypeScript compile error / test failure**

```
npm test -- --reporter=verbose 2>&1 | head -30
```

**Step 3: Add field to type**

In `src/engine/types.ts`, in `GuaranteedIncomeConfig`, add after `values_as_of`:

```typescript
tax_jurisdiction?: 'UK' | 'IoM' | string;  // defaults to primary if absent
```

**Step 4: Run tests — expect pass**

```
npm test
```

**Step 5: Commit**

```
git add src/engine/types.ts src/engine/__tests__/projection.test.ts
git commit -m "feat(types): add tax_jurisdiction to GuaranteedIncomeConfig"
```

---

### Task 2: Add `tax_secondary` and `tax_residency` to PlannerConfig

**Objective:** Store the secondary (IoM) tax config and a residency mode flag on the plan.

**Files:**
- Modify: `src/engine/types.ts`

**Step 1: Write failing test**

In `src/engine/__tests__/projection.test.ts`, add:

```typescript
it('PlannerConfig accepts tax_residency and tax_secondary fields', () => {
  const cfg = JSON.parse(JSON.stringify(MULTI_POT_CONFIG)) as PlannerConfig;
  cfg.tax_residency = 'split';
  cfg.tax_secondary = {
    regime: 'IoM',
    personal_allowance: 17000,
    bands: [
      { name: 'Standard rate', width: 6500, rate: 0.10 },
      { name: 'Higher rate', width: null, rate: 0.21 },
    ],
  };
  expect(cfg.tax_residency).toBe('split');
  expect(cfg.tax_secondary?.bands[0]?.rate).toBe(0.10);
});
```

**Step 2: Run — expect compile error**

**Step 3: Add fields to PlannerConfig in `src/engine/types.ts`**

After the existing `tax: TaxConfig;` line, add:

```typescript
tax_residency?: 'UK' | 'IoM' | 'split';  // 'UK' = default, 'IoM' = all IoM, 'split' = per-stream
tax_secondary?: TaxConfig;                 // used when tax_residency is 'split' or 'IoM'
```

**Step 4: Run all tests — expect pass**

```
npm test
```

**Step 5: Commit**

```
git add src/engine/types.ts src/engine/__tests__/projection.test.ts
git commit -m "feat(types): add tax_residency and tax_secondary to PlannerConfig"
```

---

### Task 3: Add IoM preset TaxConfig to configStore

**Objective:** Provide a ready-made IoM tax config preset so the UI can offer a one-click switch.

**Files:**
- Modify: `src/store/configStore.ts`

**Step 1: No test needed for a constant — just verify it compiles and has correct values**

**Step 2: Add preset after DEFAULT_CONFIG in `src/store/configStore.ts`**

```typescript
export const IOM_TAX_CONFIG: TaxConfig = {
  regime: 'Isle of Man',
  personal_allowance: 17000,   // 2025/26 single person
  bands: [
    { name: 'Standard rate', width: 6500, rate: 0.10 },
    { name: 'Higher rate', width: null, rate: 0.21 },
  ],
  tax_cap_enabled: false,
  tax_cap_amount: 220000,      // IoM optional tax cap (irrevocable election — user choice)
};

export const UK_TAX_CONFIG: TaxConfig = {
  regime: 'UK',
  personal_allowance: 12570,   // 2024/25
  bands: [
    { name: 'Basic rate', width: 37700, rate: 0.20 },
    { name: 'Higher rate', width: null, rate: 0.40 },
  ],
  tax_cap_enabled: false,
  tax_cap_amount: 200000,
};
```

**Step 3: Run build to confirm no TS errors**

```
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```
git add src/store/configStore.ts
git commit -m "feat(config): add IOM_TAX_CONFIG and UK_TAX_CONFIG presets"
```

---

### Task 4: Engine — split-tax annual calculation

**Objective:** When `tax_residency === 'split'`, the engine must calculate tax in two streams:
- Stream A (UK): guaranteed income streams with `tax_jurisdiction === 'UK'` (or no field set and
  primary tax is UK) — taxed using `config.tax`
- Stream B (IoM): DC drawdowns + guaranteed income with `tax_jurisdiction === 'IoM'` — taxed
  using `config.tax_secondary`

The YearRow needs to expose both tax breakdowns.

**Files:**
- Modify: `src/engine/types.ts` — extend YearRow
- Modify: `src/engine/projection.ts` — split tax calculation logic

**Step 1: Extend YearRow in `src/engine/types.ts`**

Add after `tax_breakdown: TaxResult;`:

```typescript
tax_breakdown_secondary?: TaxResult;   // IoM tax calculation when split residency active
tax_due_secondary?: number;            // IoM tax paid this year
```

**Step 2: Write a failing test for split-tax projection**

In `src/engine/__tests__/projection.test.ts`, add a new describe block:

```typescript
describe('split tax residency', () => {
  it('taxes DC drawdowns under IoM rules when tax_residency is split', () => {
    const cfg = JSON.parse(JSON.stringify(MULTI_POT_CONFIG)) as PlannerConfig;
    cfg.tax_residency = 'split';
    cfg.tax_secondary = IOM_TAX_CONFIG;
    // Mark State Pension as IoM-taxed
    cfg.guaranteed_income[0]!.tax_jurisdiction = 'IoM';

    const result = runProjection(cfg);
    const yr = result.years[0]!;

    // DC drawdowns should be taxed at IoM rates (10%/21%) not UK rates (20%/40%)
    // so tax_due_secondary should exist and be lower than if taxed at UK rates
    expect(yr.tax_due_secondary).toBeDefined();
    expect(yr.tax_due_secondary).toBeGreaterThanOrEqual(0);

    // total tax = UK portion + IoM portion
    expect(yr.tax_due).toBeCloseTo(
      (yr.tax_breakdown?.total ?? 0) + (yr.tax_breakdown_secondary?.total ?? 0),
      0
    );
  });

  it('net_income_achieved deducts both UK and IoM tax', () => {
    const cfg = JSON.parse(JSON.stringify(MULTI_POT_CONFIG)) as PlannerConfig;
    cfg.tax_residency = 'split';
    cfg.tax_secondary = IOM_TAX_CONFIG;
    cfg.guaranteed_income[0]!.tax_jurisdiction = 'IoM';

    const result = runProjection(cfg);
    const yr = result.years[0]!;

    const expectedNet = yr.guaranteed_total + yr.dc_withdrawal_gross + yr.tf_withdrawal
      - yr.tax_due;
    expect(yr.net_income_achieved).toBeCloseTo(expectedNet, 0);
  });
});
```

**Step 3: Run — expect failures**

**Step 4: Implement split-tax in `src/engine/projection.ts`**

The key change is in the year-boundary finalisation block (around line 472) and in the monthly
gross-up calculation (around line 646). The logic becomes:

When `cfg.tax_residency === 'split'`:

a) Separate guaranteed income into UK-taxable and IoM-taxable buckets based on each stream's
   `tax_jurisdiction` field (defaulting to 'UK' if absent).

b) DC drawdowns (gross minus 25% TF portion) always go into the IoM bucket when split.
   Rationale: under the DTA, private pension drawdowns are taxed only in the country of residence.

c) Run two tax calculations:
   - `ukTax = calculateTax(ukTaxableIncome, cfg.tax)` (UK-sourced: govt service pensions, any
     income explicitly marked UK)
   - `iomTax = calculateTax(iomTaxableIncome, cfg.tax_secondary)` (DC drawdowns + SP + IoM-marked)

d) `total_tax_due = ukTax.total + iomTax.total`

e) In the gross-up solver (monthly DC withdrawal calculation), use `cfg.tax_secondary` when
   computing how much gross DC to withdraw to achieve target net — since DC is IoM-taxed.

Store both TaxResult objects in YearRow.

The critical gross-up change (around line 655-660 in projection.ts):

```typescript
const grossUpTaxCfg = (cfg.tax_residency === 'split' || cfg.tax_residency === 'IoM')
  ? (cfg.tax_secondary ?? taxCfg)
  : taxCfg;

// Use iomTaxableBase (not full guaranteed taxable) for the gross-up solver
// because only IoM-taxed guaranteed income counts against the IoM bands
const dcGrossAnnual = grossUp(annualShortfallM, iomTaxableBaseM, wavgTfp, grossUpTaxCfg);
```

**Step 5: Run all tests — all should pass**

```
npm test
```

**Step 6: Commit**

```
git add src/engine/types.ts src/engine/projection.ts src/engine/__tests__/projection.test.ts
git commit -m "feat(engine): implement split tax residency calculation"
```

---

### Task 5: Update workings.ts and sanityChecks.ts for split tax

**Objective:** The YearWorkingsModal and VerificationPanel should correctly reflect split-tax years.

**Files:**
- Modify: `src/engine/workings.ts`
- Modify: `src/engine/sanityChecks.ts`

**Step 1: In `src/engine/workings.ts`**

In `computeYearWorkings`, after the existing tax breakdown section, add a conditional block:

```typescript
if (yr.tax_breakdown_secondary) {
  steps.push({
    id: 'iom_tax',
    label: 'IoM Tax (DC drawdowns + IoM-taxed guaranteed income)',
    formula: `IoM taxable ${fmtGBP(yr.tax_breakdown_secondary.taxable_income)} at IoM rates`,
    value: yr.tax_breakdown_secondary.total,
    note: 'Taxed under Isle of Man rules per UK-IoM DTA (SI 2018/1347)',
  });
}
```

**Step 2: In `src/engine/sanityChecks.ts`**

The `income_identity` check currently verifies:
  net_income = guaranteed + dc_gross + tf - tax_due

This still holds because `tax_due` in the split case equals UK tax + IoM tax combined.
No change needed — verify by running sanityChecks tests.

**Step 3: Run tests**

```
npm test
```

**Step 4: Commit**

```
git add src/engine/workings.ts src/engine/sanityChecks.ts
git commit -m "feat(engine): update workings and sanity checks for split tax"
```

---

## Phase 2 — UI

### Task 6: Tax Residency section in ConfigPanel

**Objective:** Add a collapsible "Tax Residency" section to ConfigPanel that lets the user:
- Select residency mode: UK only / Isle of Man only / Split (UK + IoM)
- When Split or IoM is selected, show the IoM tax config fields (pre-filled from IOM_TAX_CONFIG)
- Show a disclaimer about the 25% PCLS uncertainty

**Files:**
- Modify: `src/components/dashboard/ConfigPanel.tsx`
- Modify: `src/store/configStore.ts` — ensure updateConfig handles new fields

**Step 1: Add residency mode selector**

Below the existing Tax section in ConfigPanel, add a new collapsible section "Tax Residency":

```tsx
<Section title="Tax Residency" collapsible defaultOpen={config.tax_residency !== undefined && config.tax_residency !== 'UK'}>
  <Field label="Residency mode">
    <select
      value={config.tax_residency ?? 'UK'}
      onChange={e => updateConfig(prev => ({
        ...prev,
        tax_residency: e.target.value as 'UK' | 'IoM' | 'split',
        tax_secondary: e.target.value !== 'UK'
          ? (prev.tax_secondary ?? IOM_TAX_CONFIG)
          : undefined,
      }))}
      className="input-field"
    >
      <option value="UK">UK only</option>
      <option value="IoM">Isle of Man only</option>
      <option value="split">Split (UK + IoM via DTA)</option>
    </select>
  </Field>

  {(config.tax_residency === 'split' || config.tax_residency === 'IoM') && (
    <>
      <div className="text-xs text-amber-600 bg-amber-50 rounded p-2 mt-2">
        <strong>Note:</strong> Under the UK-IoM Double Tax Agreement (SI 2018/1347):
        private DC drawdowns are taxed in the IoM; government-service pensions remain UK-taxed.
        The 25% tax-free cash (PCLS) treatment for IoM residents is not definitively settled —
        seek specialist cross-border pension tax advice before relying on these projections.
      </div>
      {/* IoM tax bands editor — same pattern as existing UK tax bands editor */}
      <TaxConfigEditor
        label="Isle of Man Tax"
        taxConfig={config.tax_secondary ?? IOM_TAX_CONFIG}
        onChange={tc => updateConfig(prev => ({ ...prev, tax_secondary: tc }))}
      />
    </>
  )}
</Section>
```

Note: `TaxConfigEditor` is the existing tax bands UI component — extract it from the current
Tax section into a reusable sub-component so it can be used for both UK and IoM configs.

**Step 2: Extract TaxConfigEditor sub-component**

Locate the tax bands rendering section in ConfigPanel (the personal_allowance field + bands loop)
and extract it into a local component `TaxConfigEditor` at the top of ConfigPanel.tsx:

```tsx
function TaxConfigEditor({
  label,
  taxConfig,
  onChange,
}: {
  label: string;
  taxConfig: TaxConfig;
  onChange: (tc: TaxConfig) => void;
}) {
  // ... move existing tax bands UI here
}
```

**Step 3: Build to verify no TS errors**

```
npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```
git add src/components/dashboard/ConfigPanel.tsx src/store/configStore.ts
git commit -m "feat(ui): add Tax Residency section to ConfigPanel with IoM preset"
```

---

### Task 7: Per-stream jurisdiction selector on Guaranteed Income

**Objective:** Each guaranteed income stream in ConfigPanel shows a "Taxed in" dropdown
(UK / IoM) when split residency is active.

**Files:**
- Modify: `src/components/dashboard/ConfigPanel.tsx`

**Step 1: In the guaranteed income rendering loop, add a conditional field**

After the existing "Taxable" yes/no selector for each `gi` entry:

```tsx
{(config.tax_residency === 'split') && (
  <Field label="Taxed in">
    <select
      value={gi.tax_jurisdiction ?? 'UK'}
      onChange={e => updateGuaranteed(i, 'tax_jurisdiction', e.target.value)}
      className="input-field"
    >
      <option value="UK">UK</option>
      <option value="IoM">Isle of Man</option>
    </select>
    {gi.name.toLowerCase().includes('state pension') && (
      <p className="text-xs text-slate-500 mt-1">
        State Pension: taxed in IoM under DTA, but requires NT coding notice from HMRC.
      </p>
    )}
    {(gi.tax_jurisdiction === 'UK' || !gi.tax_jurisdiction) && gi.name.toLowerCase().includes('civil') ||
     gi.name.toLowerCase().includes('nhs') || gi.name.toLowerCase().includes('military') ? (
      <p className="text-xs text-slate-500 mt-1">
        Government-service pensions remain UK-taxed under DTA Article 18.
      </p>
    ) : null}
  </Field>
)}
```

**Step 2: Update `updateGuaranteed` in ConfigPanel to handle `tax_jurisdiction` field**

The existing `updateGuaranteed` function uses `keyof GuaranteedIncomeConfig` — since we added
`tax_jurisdiction` to the type in Task 1, this should already work. Verify.

**Step 3: Build to verify**

```
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```
git add src/components/dashboard/ConfigPanel.tsx
git commit -m "feat(ui): add per-stream jurisdiction selector for split residency"
```

---

### Task 8: YearTable and YearWorkingsModal — show split tax breakdown

**Objective:** When split residency is active, the YearTable should show both UK tax and IoM tax
as separate line items, and the workings modal should show both calculations.

**Files:**
- Modify: `src/components/dashboard/YearTable.tsx`
- Modify: `src/components/common/YearWorkingsModal.tsx`

**Step 1: In YearTable.tsx**

In the expanded row detail (currently shows Tax due as a single figure), change to:

```tsx
{yr.tax_breakdown_secondary ? (
  <>
    <span>UK tax: {fmt(yr.tax_breakdown.total)}</span>
    <span>IoM tax: {fmt(yr.tax_breakdown_secondary.total)}</span>
    <span className="font-medium">Total tax: {fmt(yr.tax_due)}</span>
  </>
) : (
  <span>Tax: {fmt(yr.tax_due)}</span>
)}
```

**Step 2: In YearWorkingsModal.tsx**

The workings steps are already generated by `computeYearWorkings` — since we updated that in
Task 5 to add an `iom_tax` step, this should appear automatically. Verify visually.

**Step 3: Build**

```
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```
git add src/components/dashboard/YearTable.tsx src/components/common/YearWorkingsModal.tsx
git commit -m "feat(ui): show split UK/IoM tax breakdown in YearTable and workings modal"
```

---

### Task 9: SummaryCards — show effective tax rate note for split residency

**Objective:** When split residency is active, the Summary Cards panel should show a note
clarifying that the effective tax rate shown is combined UK + IoM.

**Files:**
- Modify: `src/components/dashboard/SummaryCards.tsx`

**Step 1: Locate the effective tax rate card in SummaryCards.tsx**

Find where `avg_effective_tax_rate` is rendered and add a conditional sub-label:

```tsx
{config.tax_residency === 'split' && (
  <p className="text-xs text-slate-500">Combined UK + IoM</p>
)}
```

**Step 2: Build and commit**

```
npm run build 2>&1 | tail -10
git add src/components/dashboard/SummaryCards.tsx
git commit -m "feat(ui): note combined tax rate in SummaryCards for split residency"
```

---

## Phase 3 — Tests, Defaults, and Polish

### Task 10: Add split-tax fixtures and golden snapshot

**Objective:** Add a reference fixture for IoM residency scenarios and a golden snapshot test
to lock in the correct output, preventing regressions.

**Files:**
- Modify: `src/engine/__tests__/fixtures.ts` — add IoM split residency fixture
- Create: `src/engine/__tests__/golden/iom_split.json` — generated golden file
- Modify: `src/engine/__tests__/golden/generate.ts` — add IoM scenario

**Step 1: Add fixture to `src/engine/__tests__/fixtures.ts`**

```typescript
export const IOM_SPLIT_CONFIG: PlannerConfig = {
  ...MULTI_POT_CONFIG,
  tax_residency: 'split',
  tax_secondary: {
    regime: 'Isle of Man',
    personal_allowance: 17000,
    bands: [
      { name: 'Standard rate', width: 6500, rate: 0.10 },
      { name: 'Higher rate', width: null, rate: 0.21 },
    ],
  },
  guaranteed_income: [
    {
      ...MULTI_POT_CONFIG.guaranteed_income[0]!,
      tax_jurisdiction: 'IoM',  // State Pension claimed under DTA
    },
  ],
};
```

**Step 2: Add IoM scenario to `src/engine/__tests__/golden/generate.ts` and regenerate**

```
npx vitest run src/engine/__tests__/golden/generate.ts
```

**Step 3: Run all tests**

```
npm test
```

**Step 4: Commit**

```
git add src/engine/__tests__/fixtures.ts src/engine/__tests__/golden/
git commit -m "test: add IoM split residency fixture and golden snapshot"
```

---

### Task 11: Update DEFAULT_CONFIG and configStore migration

**Objective:** Ensure existing saved configs (localStorage) without the new fields load cleanly
without breaking. Add a migration shim in `loadConfig`.

**Files:**
- Modify: `src/store/configStore.ts`

**Step 1: In `loadConfig`, after parsing, add field defaults**

```typescript
export function loadConfig(): PlannerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as PlannerConfig;
      // Migration: ensure new fields have defaults
      cfg.tax_residency = cfg.tax_residency ?? 'UK';
      for (const gi of cfg.guaranteed_income) {
        gi.tax_jurisdiction = gi.tax_jurisdiction ?? 'UK';
      }
      return cfg;
    }
  } catch {
    // fall through
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}
```

**Step 2: Run all tests**

```
npm test
```

**Step 3: Commit**

```
git add src/store/configStore.ts
git commit -m "feat(store): migrate existing configs to include tax_residency defaults"
```

---

### Task 12: Update rip-uk-tax-year-update skill with IoM notes

**Objective:** The annual update skill should now also include IoM figures to check each April.

After completing implementation, update the skill:

```
skill_manage(action='patch', name='rip-uk-tax-year-update',
  old_string='## What Has NOT Changed (by design)',
  new_string=`## IoM Tax Figures (update alongside UK each April)

| Figure | 2025/26 | Source |
|---|---|---|
| IoM personal allowance (single) | IMP 17,000 | gov.im / PwC Tax Summaries |
| IoM standard rate band | IMP 6,500 | gov.im |
| IoM standard rate | 10% | gov.im |
| IoM higher rate | 21% | gov.im |
| IoM tax cap (irrevocable election) | IMP 220,000 | gov.im |

Files to update: src/store/configStore.ts — IOM_TAX_CONFIG

## What Has NOT Changed (by design)`)
```

---

## Phase 4 — Final Verification

### Task 13: Full test run and build

```
npm test
npm run build
```

All tests must pass. Zero TypeScript errors.

### Task 14: Manual smoke test

1. Open app in browser
2. Go to Dashboard -> Config -> Tax Residency
3. Switch to "Split (UK + IoM via DTA)"
4. Observe IoM tax config appears pre-filled
5. On State Pension guaranteed income, set "Taxed in" = Isle of Man
6. Observe projection recalculates — YearTable should show lower tax (IoM rates)
7. Expand a year row — verify both UK tax and IoM tax shown separately
8. Click "Show full workings" — verify iom_tax step appears in modal
9. Check VerificationPanel — all sanity checks green

### Task 15: Commit and push

```
git add -A
git commit -m "feat: add split tax residency for UK/IoM DTA scenarios"
git push
```

---

## Notes for Implementer

PCLS UNCERTAINTY — DO NOT MODEL AS SETTLED:
The 25% tax-free cash on DC drawdowns is modelled as tax-free at source (as it currently is).
The disclaimer in the UI (Task 6) is the correct response to the uncertainty. Do not change the
25% tax-free portion logic — leave it as-is and let the disclaimer carry the weight.

IoM HAS NO CAPITAL GAINS TAX:
ISAs remain in `tax_free_accounts` — their withdrawals are tax-free regardless of residency.
No change needed to ISA handling.

GOVERNMENT SERVICE PENSIONS:
The current `taxable: boolean` field already covers the "taxable vs not taxable" question.
Government service pensions should be configured with `tax_jurisdiction: 'UK'` — they stay
UK-taxed under DTA Article 18 regardless of residency. The UI hint text in Task 7 reminds
users of this but does not enforce it (user may have non-government UK-source income too).

SCOTLAND:
Scottish taxpayers have different rates (19%/20%/21%/42%/45%). This feature is not in scope
but the architecture supports it — a future `tax_residency: 'Scotland'` with appropriate
`tax_secondary` config would work identically.
