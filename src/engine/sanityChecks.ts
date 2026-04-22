/**
 * sanityChecks.ts
 *
 * Runs a battery of named assertions over a complete ProjectionResult.
 * Each check is self-contained, labelled, and shows the exact values tested.
 * Pass/warn/fail status gives users and advisors confidence the engine is
 * internally consistent.
 */

import type { ProjectionResult } from './types';

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

function fmtGBP(n: number): string {
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

  // ── Check 1: Income identity ─────────────────────────────────────────
  // For every year: guaranteed + dc_gross + tf_withdrawal − tax = net_income_achieved
  let incomeFailAge: number | null = null;
  let worstIncomeDelta = 0;
  for (const yr of years) {
    const expected = round2(yr.guaranteed_total + yr.dc_withdrawal_gross + yr.tf_withdrawal - yr.tax_due);
    const delta = Math.abs(expected - yr.net_income_achieved);
    if (delta > worstIncomeDelta) worstIncomeDelta = delta;
    if (delta > 2 && incomeFailAge === null) incomeFailAge = yr.age;
  }
  checks.push({
    id: 'income_identity',
    label: 'Income identity',
    description: 'Guaranteed + DC gross + TF withdrawals − Tax = Net income achieved, for every year',
    status: incomeFailAge === null ? 'pass' : 'fail',
    detail: incomeFailAge === null
      ? `All ${years.length} years balance correctly (max rounding error: ${fmtGBP(worstIncomeDelta)})`
      : `Discrepancy at age ${incomeFailAge} — max delta ${fmtGBP(worstIncomeDelta)}`,
  });

  // ── Check 2: Tax monotonicity ─────────────────────────────────────────
  // When taxable income rises by more than £500, tax should not fall by more than £500
  let taxMonotonicViolations = 0;
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1]!;
    const curr = years[i]!;
    if (
      curr.total_taxable_income > prev.total_taxable_income + 500 &&
      curr.tax_due < prev.tax_due - 500
    ) {
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

  // ── Check 3: Capital non-negative ─────────────────────────────────────
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
      ? 'All pot balances remain ≥ 0 throughout'
      : `Negative balance first detected at age ${firstNegativeAge}`,
  });

  // ── Check 4: Pot P&L consistency ─────────────────────────────────────
  // opening + growth − fees − withdrawal = closing (within £2 rounding)
  let pnlFailAge: number | null = null;
  let pnlFailPot: string | null = null;
  outerLoop: for (const yr of years) {
    for (const [potName, pnl] of Object.entries(yr.pot_pnl)) {
      const expected = round2(pnl.opening + pnl.growth - pnl.fees - pnl.withdrawal);
      const delta = Math.abs(expected - pnl.closing);
      if (delta > 2) {
        pnlFailAge = yr.age;
        pnlFailPot = potName;
        break outerLoop;
      }
    }
  }
  const numPots = Object.keys(years[0]!.pot_pnl).length;
  checks.push({
    id: 'pot_pnl_identity',
    label: 'Pot P&L identity',
    description: 'For each pot each year: opening + growth − fees − withdrawal = closing balance',
    status: pnlFailAge === null ? 'pass' : 'fail',
    detail: pnlFailAge === null
      ? `All ${years.length} years × ${numPots} pot(s) balance correctly`
      : `P&L mismatch in "${pnlFailPot}" at age ${pnlFailAge}`,
  });

  // ── Check 5: Tax bands sum to tax_due ─────────────────────────────────
  let taxBandFailAge: number | null = null;
  for (const yr of years) {
    const bandSum = round2(yr.tax_breakdown.bands.reduce((s, b) => s + b.tax, 0));
    const delta = Math.abs(bandSum - yr.tax_due);
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

  // ── Check 6: Growth rates within plausible range ──────────────────────
  const firstYear = years[0]!;
  const extremePots: string[] = [];
  for (const [potName, pnl] of Object.entries(firstYear.pot_pnl)) {
    const rate = pnl.provenance.rate;
    if (rate < -0.2 || rate > 0.3) {
      extremePots.push(`${potName} (${(rate * 100).toFixed(1)}%)`);
    }
  }
  checks.push({
    id: 'growth_rate_sensible',
    label: 'Growth rates are plausible',
    description: 'All pot growth rates are within a reasonable range (−20% to +30%)',
    status: extremePots.length === 0 ? 'pass' : 'warn',
    detail: extremePots.length === 0
      ? 'All growth rates are within normal bounds'
      : `Unusual rates detected: ${extremePots.join(', ')}`,
  });

  // ── Check 7: Shortfall consistency ───────────────────────────────────
  // If summary says sustainable, no individual year should have shortfall=true
  const sustainableButHasShortfall =
    result.summary.sustainable && years.some(y => y.shortfall);
  checks.push({
    id: 'shortfall_consistency',
    label: 'Shortfall consistency',
    description: 'If summary says "sustainable", no individual year should show a shortfall',
    status: sustainableButHasShortfall ? 'fail' : 'pass',
    detail: sustainableButHasShortfall
      ? 'Summary says sustainable but a year-level shortfall was found — please report this'
      : 'Summary and year-level shortfall flags agree',
  });

  // ── Aggregate ─────────────────────────────────────────────────────────
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
