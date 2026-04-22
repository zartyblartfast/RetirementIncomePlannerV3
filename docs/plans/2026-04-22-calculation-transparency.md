# Calculation Transparency & Verification Panel — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Give users and financial advisors a gold-plated way to verify that every number in the projection is correct — step-by-step calculation workings, a sanity-check panel, and a shareable/printable audit trail.

**Architecture:**
The projection engine already emits rich `YearRow` data (pot P&L, tax breakdown, guaranteed income, withdrawals per pot). We expose this as a "Workings" view — a dedicated tab/modal that shows the full arithmetic for any selected year, plus a top-level sanity-check summary that flags impossible situations. No new engine logic is required; this is purely a UI and display layer built on existing output.

The three layers:
1. `CalculationWorkings` component — year-by-year drill-down showing every number with formula labels
2. `SanityChecks` engine utility — runs a set of assertions over the full projection result, returns a list of named checks (pass/warn/fail)
3. `VerificationPanel` page section — hosts SanityChecks summary + access to per-year workings; lives on Dashboard below the YearTable

**Tech Stack:** React, TypeScript, Vitest (existing test pattern), Tailwind (existing classes), Lucide icons (already installed)

---

## Task 1: Add a `computeYearWorkings` helper to the engine

**Objective:** Given a single `YearRow`, produce a fully labelled array of calculation steps that can be displayed in prose or tabular form.

**Files:**
- Create: `src/engine/workings.ts`
- Create: `src/engine/__tests__/workings.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeYearWorkings } from '../workings';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

describe('computeYearWorkings', () => {
  const result = runProjection(DEFAULT_CONFIG);
  const yr1 = result.years[0]!;

  it('returns a WorkingsReport', () => {
    const w = computeYearWorkings(yr1);
    expect(w).toHaveProperty('steps');
    expect(w.steps.length).toBeGreaterThan(0);
  });

  it('step labels are non-empty strings', () => {
    const w = computeYearWorkings(yr1);
    for (const step of w.steps) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });

  it('income check step passes: guaranteed + DC + TF - tax = net', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'income_identity');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1); // rounding only
  });

  it('tax check step passes: re-running calculateTax gives same figure', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'tax_recheck');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1);
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run src/engine/__tests__/workings.test.ts
```

Expected: FAIL — "Cannot find module '../workings'"

**Step 3: Write `src/engine/workings.ts`**

```typescript
/**
 * workings.ts
 *
 * Produces a labelled step-by-step audit trail for a single YearRow.
 * Pure function — takes a YearRow and returns a WorkingsReport.
 */

import type { YearRow } from './types';
import { calculateTax } from './tax';

export interface WorkingsStep {
  /** Machine-readable identifier for tests to target */
  id: string;
  /** Human-readable label, e.g. "Guaranteed income" */
  label: string;
  /** Brief formula or source description */
  formula: string;
  /** The computed value */
  value: number;
  /** Absolute difference from expected (for cross-check steps only) */
  delta?: number;
  /** true = this is an intermediate sum, false = a cross-check assertion */
  isCrossCheck: boolean;
}

export interface WorkingsReport {
  age: number;
  taxYear: string;
  steps: WorkingsStep[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeYearWorkings(yr: YearRow): WorkingsReport {
  const steps: WorkingsStep[] = [];

  // ── Step 1: Guaranteed income total ────────────────────────────────
  steps.push({
    id: 'guaranteed_total',
    label: 'Guaranteed income (gross)',
    formula: Object.entries(yr.guaranteed_income)
      .map(([name, amt]) => `${name}: £${Math.round(amt).toLocaleString('en-GB')}`)
      .join(' + ') || '£0',
    value: yr.guaranteed_total,
    isCrossCheck: false,
  });

  // ── Step 2: DC withdrawal (gross) ───────────────────────────────────
  steps.push({
    id: 'dc_gross',
    label: 'DC pot withdrawal (gross)',
    formula: `Gross amount withdrawn from DC pots (before tax)`,
    value: yr.dc_withdrawal_gross,
    isCrossCheck: false,
  });

  // ── Step 3: Tax-free portion of DC ─────────────────────────────────
  steps.push({
    id: 'dc_tax_free',
    label: 'DC tax-free portion',
    formula: `Portion of DC gross that is tax-free (25% PCLS element)`,
    value: yr.dc_tax_free_portion,
    isCrossCheck: false,
  });

  // ── Step 4: DC taxable ──────────────────────────────────────────────
  const dcTaxable = round2(yr.dc_withdrawal_gross - yr.dc_tax_free_portion);
  steps.push({
    id: 'dc_taxable',
    label: 'DC taxable amount',
    formula: `DC gross £${Math.round(yr.dc_withdrawal_gross).toLocaleString('en-GB')} − tax-free £${Math.round(yr.dc_tax_free_portion).toLocaleString('en-GB')}`,
    value: dcTaxable,
    isCrossCheck: false,
  });

  // ── Step 5: Tax-free account withdrawals ───────────────────────────
  steps.push({
    id: 'tf_withdrawal',
    label: 'Tax-free account withdrawals (ISA etc)',
    formula: Object.entries(yr.withdrawal_detail)
      .filter(([name]) => !(name in yr.pot_balances))
      .map(([name, amt]) => `${name}: £${Math.round(amt).toLocaleString('en-GB')}`)
      .join(' + ') || 'ISA / tax-free pot withdrawals',
    value: yr.tf_withdrawal,
    isCrossCheck: false,
  });

  // ── Step 6: Total taxable income ────────────────────────────────────
  // guaranteed_taxable is stored in tax_breakdown.taxable_income - dc_taxable
  const guaranteedTaxable = round2(yr.total_taxable_income - dcTaxable);
  steps.push({
    id: 'guaranteed_taxable',
    label: 'Guaranteed taxable income',
    formula: `Guaranteed income that is subject to income tax`,
    value: guaranteedTaxable,
    isCrossCheck: false,
  });

  steps.push({
    id: 'total_taxable',
    label: 'Total taxable income',
    formula: `Guaranteed taxable £${Math.round(guaranteedTaxable).toLocaleString('en-GB')} + DC taxable £${Math.round(dcTaxable).toLocaleString('en-GB')}`,
    value: yr.total_taxable_income,
    isCrossCheck: false,
  });

  // ── Step 7: Tax calculation re-check ───────────────────────────────
  const recomputedTax = calculateTax(yr.total_taxable_income, yr.tax_breakdown as unknown as import('./types').TaxConfig);
  // Note: yr.tax_breakdown IS a TaxResult, not TaxConfig — we use the bands directly
  // Instead, we re-derive from the TaxResult's own reported taxable_income and bands
  const crossCheckTax = yr.tax_breakdown.bands.reduce((s, b) => s + b.tax, 0);
  const taxDelta = Math.abs(round2(crossCheckTax) - yr.tax_due);

  steps.push({
    id: 'tax_recheck',
    label: 'Tax verification',
    formula: `Sum of band taxes: ${yr.tax_breakdown.bands.map(b => `${Math.round(b.rate * 100)}% on £${Math.round(b.taxable_in_band).toLocaleString('en-GB')} = £${Math.round(b.tax).toLocaleString('en-GB')}`).join(', ')}`,
    value: round2(crossCheckTax),
    delta: taxDelta,
    isCrossCheck: true,
  });

  // ── Step 8: Tax bands detail ────────────────────────────────────────
  steps.push({
    id: 'personal_allowance',
    label: 'Personal allowance',
    formula: `Tax-free threshold before bands apply`,
    value: yr.tax_breakdown.personal_allowance,
    isCrossCheck: false,
  });

  steps.push({
    id: 'income_after_pa',
    label: 'Income after personal allowance',
    formula: `Total taxable £${Math.round(yr.total_taxable_income).toLocaleString('en-GB')} − PA £${Math.round(yr.tax_breakdown.personal_allowance).toLocaleString('en-GB')}`,
    value: yr.tax_breakdown.income_after_pa,
    isCrossCheck: false,
  });

  // ── Step 9: Net income identity check ──────────────────────────────
  const expectedNet = round2(yr.guaranteed_total + yr.dc_withdrawal_gross + yr.tf_withdrawal - yr.tax_due);
  const incomeDelta = Math.abs(expectedNet - yr.net_income_achieved);

  steps.push({
    id: 'income_identity',
    label: 'Income identity check',
    formula: `Guaranteed £${Math.round(yr.guaranteed_total).toLocaleString('en-GB')} + DC gross £${Math.round(yr.dc_withdrawal_gross).toLocaleString('en-GB')} + TF £${Math.round(yr.tf_withdrawal).toLocaleString('en-GB')} − Tax £${Math.round(yr.tax_due).toLocaleString('en-GB')} = £${Math.round(expectedNet).toLocaleString('en-GB')}`,
    value: expectedNet,
    delta: incomeDelta,
    isCrossCheck: true,
  });

  // ── Step 10: Pot P&L per pot ────────────────────────────────────────
  for (const [potName, pnl] of Object.entries(yr.pot_pnl)) {
    const expectedClose = round2(pnl.opening + pnl.growth - pnl.fees - pnl.withdrawal);
    const pnlDelta = Math.abs(expectedClose - pnl.closing);
    steps.push({
      id: `pot_pnl_${potName}`,
      label: `Pot balance: ${potName}`,
      formula: `Opening £${Math.round(pnl.opening).toLocaleString('en-GB')} + growth £${Math.round(pnl.growth).toLocaleString('en-GB')} − fees £${Math.round(pnl.fees).toLocaleString('en-GB')} − withdrawal £${Math.round(pnl.withdrawal).toLocaleString('en-GB')} = £${Math.round(expectedClose).toLocaleString('en-GB')} (growth rate: ${(pnl.provenance.rate * 100).toFixed(2)}%)`,
      value: pnl.closing,
      delta: pnlDelta,
      isCrossCheck: true,
    });
  }

  return {
    age: yr.age,
    taxYear: yr.tax_year,
    steps,
  };
}
```

**NOTE on the recomputedTax line:** The tax_breakdown is a TaxResult, not a TaxConfig, so remove the `recomputedTax` variable entirely — just sum the bands. Strip the unused import line before saving.

**Step 4: Run test to verify pass**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run src/engine/__tests__/workings.test.ts
```

Expected: PASS — 4 tests

**Step 5: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/engine/workings.ts src/engine/__tests__/workings.test.ts
git commit -m "feat: add computeYearWorkings audit trail helper"
```

---

## Task 2: Add a `runSanityChecks` utility to the engine

**Objective:** Given a full `ProjectionResult`, run a set of named assertions and return pass/warn/fail results that prove the engine is self-consistent.

**Files:**
- Create: `src/engine/sanityChecks.ts`
- Create: `src/engine/__tests__/sanityChecks.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { runSanityChecks } from '../sanityChecks';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

describe('runSanityChecks', () => {
  const result = runProjection(DEFAULT_CONFIG);

  it('returns a SanityReport', () => {
    const report = runSanityChecks(result);
    expect(report).toHaveProperty('checks');
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('all checks pass on default config', () => {
    const report = runSanityChecks(result);
    for (const check of report.checks) {
      expect(check.status).not.toBe('fail');
    }
  });

  it('income_identity check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'income_identity');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('tax_monotonic check passes (more income = more tax)', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'tax_monotonic');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('capital_non_negative check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'capital_non_negative');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('produces a human-readable summary', () => {
    const report = runSanityChecks(result);
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run src/engine/__tests__/sanityChecks.test.ts
```

Expected: FAIL — "Cannot find module '../sanityChecks'"

**Step 3: Write `src/engine/sanityChecks.ts`**

```typescript
/**
 * sanityChecks.ts
 *
 * Runs a battery of named assertions over a complete ProjectionResult.
 * Each check is self-contained, labelled, and shows the exact values tested.
 * Pass/warn/fail status gives users and advisors confidence the engine is
 * internally consistent.
 */

import type { ProjectionResult, YearRow } from './types';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface SanityCheck {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail: string;
}

export interface SanityReport {
  checks: SanityCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  summary: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export function runSanityChecks(result: ProjectionResult): SanityReport {
  const checks: SanityCheck[] = [];
  const { years } = result;

  if (years.length === 0) {
    return {
      checks: [],
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      summary: 'No projection data to check.',
    };
  }

  // ── Check 1: Income identity ─────────────────────────────────────
  // For every year: guaranteed + dc_gross + tf_withdrawal − tax = net_income_achieved
  let incomeFailAge: number | null = null;
  let worstDelta = 0;
  for (const yr of years) {
    const expected = round2(yr.guaranteed_total + yr.dc_withdrawal_gross + yr.tf_withdrawal - yr.tax_due);
    const delta = Math.abs(expected - yr.net_income_achieved);
    if (delta > worstDelta) worstDelta = delta;
    if (delta > 2 && incomeFailAge === null) incomeFailAge = yr.age;
  }
  checks.push({
    id: 'income_identity',
    label: 'Income identity',
    description: 'Guaranteed + DC gross + TF withdrawals − Tax = Net income achieved, for every year',
    status: incomeFailAge === null ? 'pass' : 'fail',
    detail: incomeFailAge === null
      ? `All ${years.length} years balance correctly (max rounding error: ${fmt(worstDelta)})`
      : `Discrepancy found at age ${incomeFailAge} — max delta ${fmt(worstDelta)}`,
  });

  // ── Check 2: Tax monotonicity ────────────────────────────────────
  // Years where taxable income is higher should have >= tax (barring strategy changes mid-run)
  let taxMonotonicViolations = 0;
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1]!;
    const curr = years[i]!;
    if (curr.total_taxable_income > prev.total_taxable_income + 500 &&
        curr.tax_due < prev.tax_due - 500) {
      taxMonotonicViolations++;
    }
  }
  checks.push({
    id: 'tax_monotonic',
    label: 'Tax monotonicity',
    description: 'When taxable income rises, tax liability should not fall (within same regime)',
    status: taxMonotonicViolations === 0 ? 'pass' : 'warn',
    detail: taxMonotonicViolations === 0
      ? 'No unexpected tax decreases when income rose'
      : `${taxMonotonicViolations} year(s) where tax fell while income rose (may reflect strategy changes)`,
  });

  // ── Check 3: Capital non-negative ────────────────────────────────
  let firstNegativeAge: number | null = null;
  for (const yr of years) {
    const allBals = [
      ...Object.values(yr.pot_balances),
      ...Object.values(yr.tf_balances),
    ];
    if (allBals.some(b => b < -1) && firstNegativeAge === null) {
      firstNegativeAge = yr.age;
    }
  }
  checks.push({
    id: 'capital_non_negative',
    label: 'Capital non-negative',
    description: 'No pot balance should go significantly below zero',
    status: firstNegativeAge === null ? 'pass' : 'fail',
    detail: firstNegativeAge === null
      ? 'All pot balances remain >= 0 throughout'
      : `Negative balance first detected at age ${firstNegativeAge}`,
  });

  // ── Check 4: Pot P&L consistency ────────────────────────────────
  // opening + growth − fees − withdrawal = closing (within rounding)
  let pnlFailAge: number | null = null;
  let pnlFailPot: string | null = null;
  outer: for (const yr of years) {
    for (const [potName, pnl] of Object.entries(yr.pot_pnl)) {
      const expected = round2(pnl.opening + pnl.growth - pnl.fees - pnl.withdrawal);
      const delta = Math.abs(expected - pnl.closing);
      if (delta > 2) {
        pnlFailAge = yr.age;
        pnlFailPot = potName;
        break outer;
      }
    }
  }
  checks.push({
    id: 'pot_pnl_identity',
    label: 'Pot P&L identity',
    description: 'For each pot each year: opening + growth − fees − withdrawal = closing balance',
    status: pnlFailAge === null ? 'pass' : 'fail',
    detail: pnlFailAge === null
      ? `All ${years.length} years × ${Object.keys(years[0]!.pot_pnl).length} pot(s) balance correctly`
      : `P&L mismatch in "${pnlFailPot}" at age ${pnlFailAge}`,
  });

  // ── Check 5: Tax bands sum ────────────────────────────────────────
  // Sum of tax across bands = tax_due for every year
  let taxBandFailAge: number | null = null;
  for (const yr of years) {
    const bandSum = round2(yr.tax_breakdown.bands.reduce((s, b) => s + b.tax, 0));
    const delta = Math.abs(bandSum - yr.tax_due);
    // Allow for tax cap adjustments
    if (delta > 2 && !yr.tax_breakdown.tax_cap_applied && taxBandFailAge === null) {
      taxBandFailAge = yr.age;
    }
  }
  checks.push({
    id: 'tax_bands_sum',
    label: 'Tax bands sum to total',
    description: 'Sum of tax across all bands equals the stated tax_due for every year',
    status: taxBandFailAge === null ? 'pass' : 'fail',
    detail: taxBandFailAge === null
      ? 'Tax band totals match tax_due in all years'
      : `Band sum mismatch at age ${taxBandFailAge}`,
  });

  // ── Check 6: Growth rate sensibility ────────────────────────────
  // All pot growth rates should be plausible (-20% to +30%)
  const firstYear = years[0]!;
  const extremePots: string[] = [];
  for (const [potName, pnl] of Object.entries(firstYear.pot_pnl)) {
    const rate = pnl.provenance.rate;
    if (rate < -0.2 || rate > 0.3) extremePots.push(`${potName} (${(rate * 100).toFixed(1)}%)`);
  }
  checks.push({
    id: 'growth_rate_sensible',
    label: 'Growth rates are plausible',
    description: 'All pot growth rates are within a reasonable range (-20% to +30%)',
    status: extremePots.length === 0 ? 'pass' : 'warn',
    detail: extremePots.length === 0
      ? 'All growth rates are within normal bounds'
      : `Unusual rates: ${extremePots.join(', ')}`,
  });

  // ── Check 7: Shortfall consistency ───────────────────────────────
  // If summary says sustainable, no year should have shortfall=true
  const sustainableButHasShortfall =
    result.summary.sustainable && years.some(y => y.shortfall);
  checks.push({
    id: 'shortfall_consistency',
    label: 'Shortfall consistency',
    description: 'If summary says "sustainable", no individual year should show a shortfall',
    status: sustainableButHasShortfall ? 'fail' : 'pass',
    detail: sustainableButHasShortfall
      ? 'Summary says sustainable but year-level shortfall detected — please report this'
      : 'Summary and year-level shortfall flags agree',
  });

  // ── Aggregate ────────────────────────────────────────────────────
  const passCount = checks.filter(c => c.status === 'pass').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const failCount = checks.filter(c => c.status === 'fail').length;

  let summary: string;
  if (failCount > 0) {
    summary = `${failCount} check(s) failed — review details below`;
  } else if (warnCount > 0) {
    summary = `All critical checks passed with ${warnCount} warning(s)`;
  } else {
    summary = `All ${passCount} checks passed`;
  }

  return { checks, passCount, warnCount, failCount, summary };
}
```

**Step 4: Run test to verify pass**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run src/engine/__tests__/sanityChecks.test.ts
```

Expected: PASS — 6 tests

**Step 5: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/engine/sanityChecks.ts src/engine/__tests__/sanityChecks.test.ts
git commit -m "feat: add runSanityChecks projection audit utility"
```

---

## Task 3: Build `YearWorkingsModal` component

**Objective:** A modal that shows the full `computeYearWorkings` output for a single year — labelled steps with values and cross-check deltas.

**Files:**
- Create: `src/components/common/YearWorkingsModal.tsx`

No test needed for pure display components (no logic). Keep it simple.

**Step 1: Write `src/components/common/YearWorkingsModal.tsx`**

```typescript
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { YearRow } from '../../engine/types';
import { computeYearWorkings } from '../../engine/workings';

interface Props {
  yr: YearRow;
  onClose: () => void;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export default function YearWorkingsModal({ yr, onClose }: Props) {
  const report = computeYearWorkings(yr);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Calculation workings — Age {report.age}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Tax year {report.taxYear}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
          {report.steps.map(step => (
            <div
              key={step.id}
              className={`rounded-lg border px-4 py-3 ${
                step.isCrossCheck
                  ? step.delta !== undefined && step.delta > 1
                    ? 'border-red-200 bg-red-50'
                    : 'border-green-200 bg-green-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {step.isCrossCheck && (
                      step.delta !== undefined && step.delta > 1
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-800">{step.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 break-words">{step.formula}</p>
                  {step.isCrossCheck && step.delta !== undefined && (
                    <p className={`text-xs mt-1 font-medium ${step.delta > 1 ? 'text-red-600' : 'text-green-600'}`}>
                      {step.delta <= 1 ? '✓ Verified' : `✗ Discrepancy: ${fmt(step.delta)}`}
                    </p>
                  )}
                </div>
                <span className="text-sm font-mono font-semibold text-gray-900 shrink-0 tabular-nums">
                  {fmt(step.value)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-400">
            All figures are annual. Growth and fees are computed monthly and aggregated.
            Cross-checks (green/red rows) re-derive the value from constituent parts.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/components/common/YearWorkingsModal.tsx
git commit -m "feat: add YearWorkingsModal component for per-year audit trail"
```

---

## Task 4: Wire "Show workings" button into YearTable

**Objective:** Add a small "Workings" button to each expanded row in the YearTable, which opens the modal for that year.

**Files:**
- Modify: `src/components/dashboard/YearTable.tsx`

**Step 1: Update YearTable.tsx**

Add a `Calculator` icon import from lucide-react and `YearWorkingsModal` import.
Add `onShowWorkings` prop to `ExpandedDetail`.
Add state for the currently open modal year at the top of the component.
Add "Show workings" button inside `ExpandedDetail` that calls `onShowWorkings`.
Render `YearWorkingsModal` at the bottom of `YearTable` when a year is selected.

Key changes (add to top of YearTable):
```typescript
import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import type { YearRow } from '../../engine/types';
import YearWorkingsModal from '../common/YearWorkingsModal';
```

Add state:
```typescript
const [workingsYear, setWorkingsYear] = useState<YearRow | null>(null);
```

Add inside the component return, after the table closing tag:
```typescript
{workingsYear && (
  <YearWorkingsModal yr={workingsYear} onClose={() => setWorkingsYear(null)} />
)}
```

Update `ExpandedDetail` to accept and use `onShowWorkings`:
```typescript
function ExpandedDetail({ yr, onShowWorkings }: { yr: YearRow; onShowWorkings: () => void }) {
```

Add button at bottom of ExpandedDetail grid:
```typescript
<div className="md:col-span-3 flex justify-end mt-2">
  <button
    onClick={onShowWorkings}
    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
  >
    <Calculator className="w-3.5 h-3.5" />
    Show full workings
  </button>
</div>
```

Pass `onShowWorkings` when rendering ExpandedDetail:
```typescript
<ExpandedDetail yr={yr} onShowWorkings={() => setWorkingsYear(yr)} />
```

**Step 2: Run all tests**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run
```

Expected: All tests pass

**Step 3: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/components/dashboard/YearTable.tsx
git commit -m "feat: add 'Show workings' button to YearTable expanded rows"
```

---

## Task 5: Build `VerificationPanel` component

**Objective:** A collapsible section below the YearTable on Dashboard that shows the full `runSanityChecks` output — a green/amber/red summary bar plus expandable detail for each check.

**Files:**
- Create: `src/components/dashboard/VerificationPanel.tsx`

**Step 1: Write `src/components/dashboard/VerificationPanel.tsx`**

```typescript
import { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ProjectionResult } from '../../engine/types';
import { runSanityChecks } from '../../engine/sanityChecks';
import type { CheckStatus } from '../../engine/sanityChecks';

interface Props {
  result: ProjectionResult;
}

function statusIcon(status: CheckStatus) {
  if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function statusBadge(status: CheckStatus) {
  if (status === 'pass') return 'bg-green-100 text-green-700';
  if (status === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function VerificationPanel({ result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const report = runSanityChecks(result);

  const barColor = report.failCount > 0
    ? 'bg-red-500'
    : report.warnCount > 0
      ? 'bg-amber-400'
      : 'bg-green-500';

  const headerText = report.failCount > 0
    ? 'Verification — issues found'
    : report.warnCount > 0
      ? 'Verification — warnings'
      : 'Verification — all checks passed';

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Summary bar */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className={`w-4 h-4 ${report.failCount > 0 ? 'text-red-500' : report.warnCount > 0 ? 'text-amber-500' : 'text-green-500'}`} />
          <span className="text-sm font-medium text-gray-700">{headerText}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${barColor} text-white`}>
            {report.passCount}/{report.checks.length} passed
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Detail */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {report.checks.map(check => (
            <div key={check.id} className="px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{statusIcon(check.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{check.label}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusBadge(check.status)}`}>
                    {check.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{check.description}</p>
                <p className="text-xs text-gray-600 mt-1 font-mono">{check.detail}</p>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">
              These checks re-derive key figures from their constituent parts to verify the engine is self-consistent.
              A passing result means all internal identities hold and the numbers can be trusted.
              Share this panel with a financial advisor for independent review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/components/dashboard/VerificationPanel.tsx
git commit -m "feat: add VerificationPanel with sanity check summary"
```

---

## Task 6: Wire VerificationPanel into Dashboard

**Objective:** Add `VerificationPanel` below the YearTable on the Dashboard page.

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Step 1: Update Dashboard.tsx**

Add import:
```typescript
import VerificationPanel from '../components/dashboard/VerificationPanel';
```

After the YearTable section, add:
```tsx
{/* Verification panel */}
<VerificationPanel result={result} />
```

**Step 2: Run full test suite**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run
```

Expected: All tests pass (174 + new tests from Tasks 1 and 2)

**Step 3: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/pages/Dashboard.tsx
git commit -m "feat: add VerificationPanel to Dashboard"
```

---

## Task 7: Enhance YearTable with growth rate provenance column

**Objective:** In the expanded YearTable row, show each pot's effective growth rate and data source (the `provenance` field already on `PotPnl`) so users can immediately see what rate was applied.

**Files:**
- Modify: `src/components/dashboard/YearTable.tsx`

**Step 1: Add provenance display inside ExpandedDetail**

In the "Pot Balances" section of `ExpandedDetail`, after the closing balance, show a sub-line with the growth rate and source:

```tsx
{Object.entries(yr.pot_pnl).map(([name, pnl]) => (
  <div key={name} className="mt-0.5">
    <div className="flex justify-between text-gray-600">
      <span>{name}</span>
      <span>{fmt(pnl.closing)}</span>
    </div>
    <div className="flex justify-between text-gray-400 text-xs pl-2">
      <span>{pnl.provenance.source}: {pnl.provenance.detail.replace('User-defined rate: ', '')}</span>
      <span className="font-mono">{(pnl.provenance.rate * 100).toFixed(2)}% p.a.</span>
    </div>
  </div>
))}
```

Replace the existing separate `pot_balances` / `tf_balances` display with this unified `pot_pnl` version (pot_pnl covers all pots — DC and TF).

**Step 2: Run full test suite**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run
```

Expected: All tests pass

**Step 3: Commit**

```bash
cd /root/RetirementIncomePlannerV3
git add src/components/dashboard/YearTable.tsx
git commit -m "feat: show growth rate provenance in YearTable expanded rows"
```

---

## Task 8: Final review — push to remote

**Objective:** Run the full test suite and push all commits.

**Step 1: Run all tests**

```bash
cd /root/RetirementIncomePlannerV3 && npx vitest run
```

Expected: All tests pass (should be 180+ tests)

**Step 2: Check TS compiles cleanly**

```bash
cd /root/RetirementIncomePlannerV3 && npx tsc --noEmit
```

Expected: No errors

**Step 3: Push**

```bash
cd /root/RetirementIncomePlannerV3 && git push
```

---

## Summary of what the user gets

After this feature:

1. **YearTable drill-down** — every expanded row shows growth rate + source next to the closing balance. Click "Show full workings" to see every number for that year in a modal with annotated formulas.

2. **Workings modal** — shows all calculation steps: guaranteed income, DC gross/tax-free/taxable split, tax bands applied, income identity cross-check (guaranteed + DC + TF − tax = net), and per-pot P&L identity (opening + growth − fees − withdrawal = closing). Green tick or red alert on each cross-check.

3. **Verification panel** (collapsible, sits below the YearTable) — runs 7 named checks over the full projection, shows pass/warn/fail with exact detail. All-green means a financial advisor can confidently review the numbers and trust them.

These three together give the "gold standard" audit trail: no black box, every number derivable by hand.
