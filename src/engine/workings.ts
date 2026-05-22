/**
 * workings.ts
 *
 * Produces a labelled step-by-step audit trail for a single YearRow.
 * Pure function — takes a YearRow and returns a WorkingsReport.
 */

import type { YearRow } from './types';
import type { TaxContext } from './taxContext';

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
  taxContext?: TaxContext;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtGBP(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function safeIdPart(s: string): string {
  return s.replace(/\s+/g, '_');
}

function transitionReasonLabel(reason: string): string {
  switch (reason) {
    case 'stage_depleted': return 'stage depleted';
    case 'source_unavailable': return 'source unavailable';
    case 'validation_repair': return 'validation repair';
    case 'all_sources_depleted': return 'all sources depleted';
    default: return reason.replace(/_/g, ' ');
  }
}

function pensionAccessEventLabel(eventType: string): string {
  switch (eventType) {
    case 'tax_free_cash': return 'tax-free cash event';
    case 'crystallise_and_take_pcls': return 'crystallise and take PCLS';
    case 'ufpls': return 'UFPLS';
    case 'taxable_flexi_access_drawdown': return 'taxable flexi-access drawdown';
    case 'ordinary_drawdown_marker': return 'ordinary drawdown marker';
    case 'already_taken_marker': return 'already-taken marker';
    default: return eventType.replace(/_/g, ' ');
  }
}

function pensionAccessCaveatLabel(caveat: string): string {
  switch (caveat) {
    case 'foundation_only_not_applied': return 'foundation metadata only — not applied to balances, income, or tax yet';
    case 'simplified_tfc_event_no_lsa_lsdba_tracking': return 'simplified TFC event — no LSA/LSDBA/provider/MPAA tracking is modelled';
    case 'destination_inside_plan_not_yet_modelled': return 'destination is caveated — inside-plan cash/account destination is not yet financially modelled';
    case 'pcls_above_lsa_headroom_not_modelled': return 'PCLS may exceed available Lump Sum Allowance headroom — warning only, not enforced yet';
    case 'mpaa_not_triggered_pcls_only': return 'MPAA not triggered by PCLS-only crystallisation';
    case 'mpaa_triggered_by_taxable_drawdown': return 'MPAA triggered by taxable drawdown';
    case 'crystallised_balance_insufficient_for_drawdown': return 'requested taxable drawdown exceeds available crystallised drawdown balance';
    case 'ordinary_drawdown_also_targets_this_pot': return 'ordinary staged withdrawals also target this pot; those withdrawals remain compatibility simplified pro-rata until ledger-aware withdrawals are explicitly enabled';
    default: return caveat.replace(/_/g, ' ');
  }
}

function pensionAccessCaveatSummary(caveats: string[]): string {
  if (caveats.length === 0) return 'no additional caveats recorded';
  return caveats.map(pensionAccessCaveatLabel).join('; ');
}

function projectionWarningLabel(warning: string): string {
  switch (warning) {
    case 'ledger_aware_fad_insufficient_crystallised_balance':
      return 'Ledger-aware FAD could not fund the requested ordinary withdrawal from crystallised drawdown; no automatic crystallisation or compatibility pro-rata fallback was applied.';
    default:
      return warning.replace(/_/g, ' ');
  }
}

export function computeYearWorkings(yr: YearRow, taxContext?: TaxContext): WorkingsReport {
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
  const dcTaxFreeRate = yr.dc_withdrawal_gross > 0
    ? (yr.dc_tax_free_portion / yr.dc_withdrawal_gross) * 100
    : 0;
  const hasAppliedPensionAccessEvents = (yr.pension_access_events ?? [])
    .some(event => !event.caveats.includes('foundation_only_not_applied'));
  const hasTaxableFadEvents = (yr.pension_access_events ?? [])
    .some(event => event.event_type === 'taxable_flexi_access_drawdown' && !event.caveats.includes('foundation_only_not_applied'));
  const pensionAccessEventNote = hasTaxableFadEvents
    ? 'This year includes explicit taxable flexi-access drawdown events shown below; those are 100% taxable pension income from crystallised drawdown, not gradual pro-rata tax-free cash.'
    : hasAppliedPensionAccessEvents
      ? 'Separate pension access / TFC capital events for this year are shown below and are not counted as ordinary DC income.'
      : 'No upfront lump sum is modelled in this workings path.';
  steps.push({
    id: 'dc_tax_free',
    label: 'DC tax-free pension element',
    formula: yr.dc_withdrawal_gross > 0
      ? `Gradual pro-rata assumption: ${dcTaxFreeRate.toFixed(1)}% of ordinary DC withdrawals treated as tax-free; ${fmtGBP(yr.dc_withdrawal_gross)} gross gives ${fmtGBP(yr.dc_tax_free_portion)} tax-free. ${pensionAccessEventNote}`
      : `Gradual pro-rata assumption: ordinary DC withdrawals split between tax-free and taxable portions according to each pot setting. ${pensionAccessEventNote}`,
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

  // ── Staged drawdown allocation detail ───────────────────────────────
  for (const allocation of yr.drawdown_stage_allocations ?? []) {
    const stageGrossTotal = (yr.drawdown_stage_allocations ?? [])
      .filter(other => other.stage_id === allocation.stage_id)
      .reduce((total, other) => total + other.actual_gross_withdrawal, 0);
    const actualSourceSplit = stageGrossTotal > 0 ? allocation.actual_gross_withdrawal / stageGrossTotal : 0;
    steps.push({
      id: `drawdown_stage_allocation_${safeIdPart(allocation.stage_id)}_${safeIdPart(allocation.source_name)}`,
      label: `Drawdown stage allocation: ${allocation.stage_name} / ${allocation.source_name}`,
      formula: `Target split ${(allocation.target_share * 100).toFixed(1)}%; actual source split ${(actualSourceSplit * 100).toFixed(1)}%; actual gross ${fmtGBP(allocation.actual_gross_withdrawal)}, net ${fmtGBP(allocation.actual_net_income)}, tax-free ${fmtGBP(allocation.tax_free_amount)}, taxable ${fmtGBP(allocation.taxable_amount)}`,
      value: allocation.actual_net_income,
      isCrossCheck: false,
    });
  }

  for (const transition of yr.drawdown_stage_transitions ?? []) {
    steps.push({
      id: `drawdown_stage_transition_${transition.month}_${safeIdPart(transition.from_stage_id)}_${safeIdPart(transition.to_stage_id ?? 'end')}`,
      label: `Drawdown stage transition: month ${transition.month}`,
      formula: `${transition.from_stage_name} → ${transition.to_stage_name ?? 'No further stage'} because ${transitionReasonLabel(transition.reason)}`,
      value: transition.month,
      isCrossCheck: false,
    });
  }

  for (const warning of yr.projection_warnings ?? []) {
    steps.push({
      id: `projection_warning_${safeIdPart(warning)}`,
      label: 'Projection warning',
      formula: projectionWarningLabel(warning),
      value: 0,
      isCrossCheck: false,
    });
  }

  for (const event of yr.pension_access_events ?? []) {
    const isFoundationOnly = event.caveats.includes('foundation_only_not_applied');
    const eventTreatment = isFoundationOnly
      ? 'planned only'
      : event.event_type === 'taxable_flexi_access_drawdown'
        ? 'applied as taxable flexi-access drawdown from crystallised drawdown balance; 100% taxable pension income and no further tax-free element'
        : event.event_type === 'crystallise_and_take_pcls'
          ? 'applied as crystallisation/PCLS: PCLS reduces capital but is not ordinary taxable income; remainder moves to crystallised drawdown'
          : 'applied as a separate capital event, reducing the pension pot but not ordinary income, taxable income, or tax';
    const ledgerMovement = event.uncrystallised_balance_before !== undefined && event.uncrystallised_balance_after !== undefined
      && event.crystallised_drawdown_balance_before !== undefined && event.crystallised_drawdown_balance_after !== undefined
      ? ` Uncrystallised balance ${fmtGBP(event.uncrystallised_balance_before)} → ${fmtGBP(event.uncrystallised_balance_after)}. Crystallised drawdown balance ${fmtGBP(event.crystallised_drawdown_balance_before)} → ${fmtGBP(event.crystallised_drawdown_balance_after)}.`
      : '';
    steps.push({
      id: `pension_access_event_${safeIdPart(event.id)}`,
      label: `Pension access event: ${event.pot_name}`,
      formula: `Month ${event.month}: ${pensionAccessEventLabel(event.event_type)} for ${event.pot_name}; ${eventTreatment}. Gross/tax-free amount ${fmtGBP(event.gross_amount)}; taxable amount ${fmtGBP(event.taxable_amount)}. Pot balance ${fmtGBP(event.pot_balance_before)} before → ${fmtGBP(event.pot_balance_after)} after.${ledgerMovement} Estimated TFC used ${fmtGBP(event.estimated_tfc_used)}; estimated remaining ${fmtGBP(event.estimated_tfc_remaining)}. Caveats: ${pensionAccessCaveatSummary(event.caveats)}.`,
      value: event.gross_amount,
      isCrossCheck: false,
    });
  }

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

  return { age: yr.age, taxYear: yr.tax_year, steps, taxContext };
}
