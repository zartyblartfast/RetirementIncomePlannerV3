/**
 * workings.ts
 *
 * Produces a labelled step-by-step audit trail for a single YearRow.
 * Pure function — takes a YearRow and returns a WorkingsReport.
 */

import type { YearRow } from './types';

export interface WorkingsStep {
  /** Machine-readable identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Brief formula or source description */
  formula: string;
  /** The computed value */
  value: number;
  /** Absolute difference from expected (cross-check steps only) */
  delta?: number;
  /** true = cross-check assertion row, false = intermediate value row */
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

function fmtGBP(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export function computeYearWorkings(yr: YearRow): WorkingsReport {
  const steps: WorkingsStep[] = [];

  // ── Guaranteed income ───────────────────────────────────────────────
  const guarParts = Object.entries(yr.guaranteed_income)
    .map(([name, amt]) => `${name}: ${fmtGBP(amt)}`)
    .join(' + ') || '£0';
  steps.push({
    id: 'guaranteed_total',
    label: 'Guaranteed income (gross)',
    formula: guarParts,
    value: yr.guaranteed_total,
    isCrossCheck: false,
  });

  // ── DC gross withdrawal ─────────────────────────────────────────────
  steps.push({
    id: 'dc_gross',
    label: 'DC pot withdrawal (gross)',
    formula: 'Gross amount withdrawn from DC pots before tax',
    value: yr.dc_withdrawal_gross,
    isCrossCheck: false,
  });

  // ── DC tax-free portion ─────────────────────────────────────────────
  steps.push({
    id: 'dc_tax_free',
    label: 'DC tax-free portion',
    formula: 'Portion of DC gross that is tax-free (25% PCLS element)',
    value: yr.dc_tax_free_portion,
    isCrossCheck: false,
  });

  // ── DC taxable ──────────────────────────────────────────────────────
  const dcTaxable = round2(yr.dc_withdrawal_gross - yr.dc_tax_free_portion);
  steps.push({
    id: 'dc_taxable',
    label: 'DC taxable amount',
    formula: `DC gross ${fmtGBP(yr.dc_withdrawal_gross)} − tax-free ${fmtGBP(yr.dc_tax_free_portion)}`,
    value: dcTaxable,
    isCrossCheck: false,
  });

  // ── Tax-free account withdrawals ────────────────────────────────────
  steps.push({
    id: 'tf_withdrawal',
    label: 'Tax-free account withdrawals (ISA etc)',
    formula: 'Withdrawals from ISA or other tax-free accounts',
    value: yr.tf_withdrawal,
    isCrossCheck: false,
  });

  // ── Total taxable income ────────────────────────────────────────────
  steps.push({
    id: 'total_taxable',
    label: 'Total taxable income',
    formula: 'Guaranteed taxable income + DC taxable amount',
    value: yr.total_taxable_income,
    isCrossCheck: false,
  });

  // ── Personal allowance ──────────────────────────────────────────────
  steps.push({
    id: 'personal_allowance',
    label: 'Personal allowance',
    formula: 'Tax-free threshold before bands apply',
    value: yr.tax_breakdown.personal_allowance,
    isCrossCheck: false,
  });

  // ── Income after PA ─────────────────────────────────────────────────
  steps.push({
    id: 'income_after_pa',
    label: 'Income after personal allowance',
    formula: `Total taxable ${fmtGBP(yr.total_taxable_income)} − PA ${fmtGBP(yr.tax_breakdown.personal_allowance)}`,
    value: yr.tax_breakdown.income_after_pa,
    isCrossCheck: false,
  });

  // ── Tax band details ────────────────────────────────────────────────
  for (const band of yr.tax_breakdown.bands) {
    steps.push({
      id: `tax_band_${band.name.replace(/\s+/g, '_').toLowerCase()}`,
      label: `Tax band: ${band.name} (${Math.round(band.rate * 100)}%)`,
      formula: `${fmtGBP(band.taxable_in_band)} × ${Math.round(band.rate * 100)}% = ${fmtGBP(band.tax)}`,
      value: band.tax,
      isCrossCheck: false,
    });
  }

  // ── Tax re-check cross-check ────────────────────────────────────────
  const bandSum = round2(yr.tax_breakdown.bands.reduce((s, b) => s + b.tax, 0));
  const taxDelta = Math.abs(bandSum - yr.tax_due);
  steps.push({
    id: 'tax_recheck',
    label: 'Tax verification (cross-check)',
    formula: `Sum of all tax bands = ${fmtGBP(bandSum)}, stated tax due = ${fmtGBP(yr.tax_due)}`,
    value: bandSum,
    delta: taxDelta,
    isCrossCheck: true,
  });

  // ── Income identity cross-check ─────────────────────────────────────
  const expectedNet = round2(
    yr.guaranteed_total + yr.dc_withdrawal_gross + yr.tf_withdrawal - yr.tax_due
  );
  const incomeDelta = Math.abs(expectedNet - yr.net_income_achieved);
  steps.push({
    id: 'income_identity',
    label: 'Income identity (cross-check)',
    formula: `Guaranteed ${fmtGBP(yr.guaranteed_total)} + DC gross ${fmtGBP(yr.dc_withdrawal_gross)} + TF ${fmtGBP(yr.tf_withdrawal)} − Tax ${fmtGBP(yr.tax_due)} = ${fmtGBP(expectedNet)}`,
    value: expectedNet,
    delta: incomeDelta,
    isCrossCheck: true,
  });

  // ── Per-pot P&L identity cross-checks ──────────────────────────────
  for (const [potName, pnl] of Object.entries(yr.pot_pnl)) {
    const expectedClose = round2(pnl.opening + pnl.growth - pnl.fees - pnl.withdrawal);
    const pnlDelta = Math.abs(expectedClose - pnl.closing);
    steps.push({
      id: `pot_pnl_${potName.replace(/\s+/g, '_')}`,
      label: `Pot balance check: ${potName}`,
      formula: `Opening ${fmtGBP(pnl.opening)} + growth ${fmtGBP(pnl.growth)} − fees ${fmtGBP(pnl.fees)} − withdrawal ${fmtGBP(pnl.withdrawal)} = ${fmtGBP(expectedClose)} (rate: ${(pnl.provenance.rate * 100).toFixed(2)}% p.a.)`,
      value: pnl.closing,
      delta: pnlDelta,
      isCrossCheck: true,
    });
  }

  return { age: yr.age, taxYear: yr.tax_year, steps };
}
