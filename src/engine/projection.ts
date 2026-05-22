/**
 * Retirement Income Planner V2 — Projection Engine (Monthly Stepping)
 *
 * Month-by-month deterministic projection supporting dynamic income streams.
 * Tax is computed annually; growth, fees, and withdrawals step monthly.
 *
 * Port of V1 retirement_engine.py RetirementEngine class.
 */

import type {
  PlannerConfig,
  TaxConfig,
  TaxResult,
  YearRow,
  PotPnl,
  ProjectionResult,
  ProjectionSummary,
  MonthlyRow,
  DepletionEvent,
  GrowthProvenance,
  StrategyState,
  DrawdownStageTransition,
  DrawdownStageAllocationDetail,
  DrawdownStageConfig,
  DrawdownStageSourceConfig,
  PensionAccessEventConfig,
  PensionAccessResolvedEvent,
  PensionLedgerState,
} from './types';

import { calculateTax, calculateTaxFromEventsWithModule, grossUp } from './tax';
import { annualTaxEventsFromAmounts } from './taxEvents';
import { normalizeConfig, computeAnnualTarget } from './strategies';
import { validateConfig, validateStrategyOutput } from './validation';
import { resolveSequentialDrawdownPriority } from './drawdownStages';
import {
  allocateBlendedGrossWithdrawal,
  allocateBlendedNetWithdrawal,
  hasBlendedDrawdownStages,
} from './drawdownAllocation';
import { resolvePensionAccessEvents } from './pensionAccessEvents';
import { createInitialPensionLedgerStates } from './pensionLedgerState';
import { applyPensionLedgerEvent, summarizePensionLedgerStates } from './pensionLedgerResolution';

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function annualToMonthlyRate(annualRate: number): number {
  if (annualRate === 0) return 0;
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function parseYm(s: string): [number, number] {
  const parts = s.split('-');
  return [parseInt(parts[0]!, 10), parseInt(parts[1]!, 10)];
}

function ymToAbs(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function absToYm(a: number): [number, number] {
  const y = Math.floor(a / 12);
  const m = (a % 12) + 1;
  return [y, m];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function drawdownStageDisplayName(stage: DrawdownStageConfig, stageIndex: number): string {
  return stage.name?.trim() || `Stage ${stageIndex + 1}`;
}

function sumValues(obj: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(obj)) {
    total += v;
  }
  return total;
}

function ordinaryDrawdownPotRefs(cfg: PlannerConfig): Set<string> {
  const refs = new Set<string>();
  for (const ref of cfg.withdrawal_priority ?? []) {
    refs.add(ref);
  }
  for (const stage of cfg.drawdown_stages ?? []) {
    for (const source of stage.sources ?? []) {
      if (source.source_type === 'dc_pot') {
        refs.add(source.source_name);
      }
    }
  }
  return refs;
}

function mixedPensionAccessModeWarning(potRef: string): string {
  return `Mixed pension-access mode: ${potRef} has explicit pension-access events and ordinary staged DC withdrawals also target this pot; ordinary withdrawals remain compatibility simplified pro-rata until ledger-aware withdrawals are explicitly enabled.`;
}

function roundPensionLedgerState(ledger: PensionLedgerState): PensionLedgerState {
  return {
    ...ledger,
    uncrystallised_balance: round2(ledger.uncrystallised_balance),
    crystallised_drawdown_balance: round2(ledger.crystallised_drawdown_balance),
    tax_free_cash_taken: round2(ledger.tax_free_cash_taken),
    taxable_drawdown_taken: round2(ledger.taxable_drawdown_taken),
    lsa_used: ledger.lsa_used === undefined ? undefined : round2(ledger.lsa_used),
    lsa_remaining: ledger.lsa_remaining === undefined ? undefined : round2(ledger.lsa_remaining),
    warnings: [...ledger.warnings],
  };
}

// ------------------------------------------------------------------ //
//  Growth rate resolution
// ------------------------------------------------------------------ //

/**
 * For V2, we use the manual growth_rate from config directly.
 * Asset model template resolution can be added later.
 */
function resolveGrowthRate(potConfig: { growth_rate: number }): number {
  return potConfig.growth_rate ?? 0.04;
}

function resolveGrowthProvenance(potConfig: { growth_rate: number }): GrowthProvenance {
  const rate = potConfig.growth_rate ?? 0.04;
  return {
    source: 'Manual',
    detail: `User-defined rate: ${(rate * 100).toFixed(2)}%`,
    rate,
  };
}

// ------------------------------------------------------------------ //
//  Annual aggregation state
// ------------------------------------------------------------------ //

interface AnnualAgg {
  age: number;
  tax_year: string;
  target_annual: number;
  guaranteed_gross: number;
  guaranteed_taxable: number;
  guaranteed_detail: Record<string, number>;
  dc_gross: number;
  dc_tf: number;
  tf_total: number;
  withdrawal_detail: Record<string, number>;
  pnl: Record<string, { opening: number; growth: number; fees: number; withdrawal: number }>;
  months_counted: number;
  monthly_target_sum: number;
  drawdown_stage_transitions: DrawdownStageTransition[];
  drawdown_stage_allocations: DrawdownStageAllocationDetail[];
  pension_access_events: PensionAccessResolvedEvent[];
  projection_warnings: string[];
}

interface DcMeta {
  growth_rate: number;
  annual_fees: number;
  tax_free_portion: number;
  provenance: GrowthProvenance;
}

interface TfMeta {
  growth_rate: number;
  provenance: GrowthProvenance;
}

interface GuaranteedItem {
  name: string;
  monthly: number;
  monthly_idx: number;
  start_abs: number;
  end_abs: number | null;
  taxable: boolean;
}

function taxEventsForAnnualAgg(agg: AnnualAgg) {
  return annualTaxEventsFromAmounts({
    tax_year: agg.tax_year,
    age: agg.age,
    guaranteed_gross: agg.guaranteed_gross,
    guaranteed_taxable: agg.guaranteed_taxable,
    dc_gross: agg.dc_gross,
    dc_tax_free: agg.dc_tf,
    tf_withdrawal: agg.tf_total,
  });
}

function calculateAnnualTaxFromEvents(agg: AnnualAgg, taxCfg: TaxConfig): TaxResult {
  const events = taxEventsForAnnualAgg(agg);
  return calculateTaxFromEventsWithModule(events, taxCfg);
}

// ------------------------------------------------------------------ //
//  Build year row
// ------------------------------------------------------------------ //

function buildYearRow(
  agg: AnnualAgg,
  dcBalances: Record<string, number>,
  tfBalances: Record<string, number>,
  dcMeta: Record<string, DcMeta>,
  tfMeta: Record<string, TfMeta>,
  tax: TaxResult,
): YearRow {
  const taxDue = tax.total;
  const netIncome = agg.guaranteed_gross + agg.dc_gross + agg.tf_total - taxDue;
  const totalTaxable = agg.guaranteed_taxable + (agg.dc_gross - agg.dc_tf);
  const totalCapital = sumValues(dcBalances) + sumValues(tfBalances);

  const potPnl: Record<string, PotPnl> = {};
  for (const name of Object.keys(dcBalances)) {
    const p = agg.pnl[name]!;
    potPnl[name] = {
      opening: round2(p.opening),
      growth: round2(p.growth),
      fees: round2(p.fees),
      withdrawal: round2(p.withdrawal),
      closing: round2(dcBalances[name]!),
      provenance: dcMeta[name]!.provenance,
    };
  }
  for (const name of Object.keys(tfBalances)) {
    const p = agg.pnl[name]!;
    potPnl[name] = {
      opening: round2(p.opening),
      growth: round2(p.growth),
      fees: 0,
      withdrawal: round2(p.withdrawal),
      closing: round2(tfBalances[name]!),
      provenance: tfMeta[name]!.provenance,
    };
  }

  const wd: Record<string, number> = {};
  for (const [n, v] of Object.entries(agg.withdrawal_detail)) {
    wd[n] = round2(v);
  }

  const row: YearRow = {
    age: agg.age,
    tax_year: agg.tax_year,
    target_net: round2(agg.target_annual),
    guaranteed_income: Object.fromEntries(
      Object.entries(agg.guaranteed_detail).map(([k, v]) => [k, round2(v)])
    ),
    guaranteed_total: round2(agg.guaranteed_gross),
    dc_withdrawal_gross: round2(agg.dc_gross),
    dc_tax_free_portion: round2(agg.dc_tf),
    tf_withdrawal: round2(agg.tf_total),
    withdrawal_detail: wd,
    total_taxable_income: round2(totalTaxable),
    tax_due: round2(taxDue),
    tax_breakdown: tax,
    net_income_achieved: round2(netIncome),
    shortfall: netIncome < agg.monthly_target_sum - 1,
    pot_balances: Object.fromEntries(
      Object.entries(dcBalances).map(([n, b]) => [n, round2(b)])
    ),
    tf_balances: Object.fromEntries(
      Object.entries(tfBalances).map(([n, b]) => [n, round2(b)])
    ),
    total_capital: round2(totalCapital),
    pot_pnl: potPnl,
  };

  if (agg.drawdown_stage_transitions.length > 0) {
    row.drawdown_stage_transitions = agg.drawdown_stage_transitions;
  }

  if (agg.drawdown_stage_allocations.length > 0) {
    row.drawdown_stage_allocations = agg.drawdown_stage_allocations.map(allocation => ({
      ...allocation,
      target_share: round2(allocation.target_share),
      actual_gross_withdrawal: round2(allocation.actual_gross_withdrawal),
      actual_net_income: round2(allocation.actual_net_income),
      tax_free_amount: round2(allocation.tax_free_amount),
      taxable_amount: round2(allocation.taxable_amount),
    }));
  }

  if (agg.pension_access_events.length > 0) {
    row.pension_access_events = agg.pension_access_events;
  }

  if (agg.projection_warnings.length > 0) {
    row.projection_warnings = [...agg.projection_warnings];
  }

  return row;
}

// ------------------------------------------------------------------ //
//  Main projection
// ------------------------------------------------------------------ //

export interface ProjectionOptions {
  includeMonthly?: boolean;
  initialStrategyState?: StrategyState;
}

export function runProjection(
  inputCfg: PlannerConfig,
  options: ProjectionOptions = {},
): ProjectionResult {
  // Deep clone and normalize
  const cfg: PlannerConfig = JSON.parse(JSON.stringify(inputCfg));
  normalizeConfig(cfg);

  // Validate config invariants
  const configErrors = validateConfig(cfg);
  if (configErrors.length > 0) {
    console.warn('[projection] config validation warnings:', configErrors);
  }

  const { includeMonthly = false, initialStrategyState = null } = options;
  const pensionAccessEvents = resolvePensionAccessEvents(cfg);
  const ordinaryPensionDrawdownPotRefs = ordinaryDrawdownPotRefs(cfg);
  const explicitPensionAccessPotRefs = new Set(
    pensionAccessEvents
      .filter(event => event.event_type === 'tax_free_cash'
        || event.event_type === 'crystallise_and_take_pcls'
        || event.event_type === 'taxable_flexi_access_drawdown')
      .map(event => event.pot_ref),
  );
  const ledgerAwareOrdinaryFadPotRefs = new Set(
    (cfg.dc_pots ?? [])
      .filter(pot => pot.pension_access?.category === 'explicit_ledger_aware'
        && pot.pension_access.route === 'taxable_flexi_access_drawdown')
      .map(pot => pot.name),
  );
  const mixedPensionAccessPotRefs = new Set(
    [...explicitPensionAccessPotRefs].filter(potRef =>
      ordinaryPensionDrawdownPotRefs.has(potRef) && !ledgerAwareOrdinaryFadPotRefs.has(potRef),
    ),
  );
  const taxCfg = cfg.tax;
  const endAgeCfg = cfg.personal.end_age;
  let cpi = cfg.target_income.cpi_rate;

  // Strategy setup
  const strategyId = cfg.drawdown_strategy ?? 'fixed_target';
  const strategyParams = cfg.drawdown_strategy_params ?? {};
  let targetNetAnnual: number;

  if (strategyId === 'fixed_target') {
    targetNetAnnual = strategyParams.net_annual ?? cfg.target_income.net_annual;
  } else if (strategyId === 'vanguard_dynamic' || strategyId === 'guyton_klinger') {
    targetNetAnnual = strategyParams.initial_target ?? cfg.target_income.net_annual;
  } else {
    targetNetAnnual = cfg.target_income.net_annual;
  }

  let monthlyCpi = annualToMonthlyRate(cpi);
  const cpiRateSchedule = cfg.cpi_rate_schedule ?? {};
  let strategyState: StrategyState = initialStrategyState;
  const useMonthlyFromCpi = strategyId === 'fixed_target';

  // ---- Date helpers ---- //
  const [dobY, dobM] = parseYm(cfg.personal.date_of_birth);
  const dobAbs = ymToAbs(dobY, dobM);
  const [retY, retM] = parseYm(cfg.personal.retirement_date);
  const retAbs = ymToAbs(retY, retM);

  function ageAtAbs(absMonth: number): number {
    return (absMonth - dobAbs) / 12;
  }

  const retirementAge = Math.floor(ageAtAbs(retAbs));

  // ---- Anchor date ---- //
  const allAsofAbs: number[] = [];
  for (const g of cfg.guaranteed_income) {
    if (g.values_as_of) {
      const [gy, gm] = parseYm(g.values_as_of);
      allAsofAbs.push(ymToAbs(gy, gm));
    }
  }
  for (const pot of cfg.dc_pots) {
    if (pot.values_as_of) {
      const [py, pm] = parseYm(pot.values_as_of);
      allAsofAbs.push(ymToAbs(py, pm));
    }
  }
  for (const acc of cfg.tax_free_accounts) {
    if (acc.values_as_of) {
      const [ay, am] = parseYm(acc.values_as_of);
      allAsofAbs.push(ymToAbs(ay, am));
    }
  }

  const latestAsof = allAsofAbs.length > 0 ? Math.max(...allAsofAbs) : retAbs;
  let anchorAbs = Math.max(retAbs, latestAsof);
  let anchorAge = Math.floor(ageAtAbs(anchorAbs));
  anchorAge = Math.max(anchorAge, retirementAge);

  const isPostRetirement = allAsofAbs.length > 0 && latestAsof >= retAbs;

  // End absolute month
  const configEndAge = endAgeCfg;  // user's plan end — NEVER mutated
  let projectionEndAge = (cfg as unknown as Record<string, unknown>).projection_end_age as number | undefined ?? endAgeCfg;
  if (includeMonthly) {
    projectionEndAge = Math.min(120, Math.max(projectionEndAge, 120));
  }
  const endAbs = anchorAbs + (projectionEndAge - anchorAge + 1) * 12 - 1;

  // ---- Build guaranteed income ---- //
  const guaranteed: GuaranteedItem[] = [];
  for (const g of cfg.guaranteed_income) {
    let annual = g.gross_annual;
    const idxRate = g.indexation_rate ?? 0;
    const monthlyIdx = idxRate > 0 ? annualToMonthlyRate(idxRate) : 0;

    // Index from values_as_of to anchor
    if (g.values_as_of && idxRate > 0) {
      const [asofY, asofM] = parseYm(g.values_as_of);
      const gap = anchorAbs - ymToAbs(asofY, asofM);
      if (gap > 0) {
        annual = annual * Math.pow(1 + idxRate, gap / 12);
      }
    }

    // Convert start_date/end_date to absolute months
    let startAbs: number;
    if (g.start_date) {
      const [sy, sm] = parseYm(g.start_date);
      startAbs = ymToAbs(sy, sm);
    } else {
      const sa = g.start_age ?? retirementAge;
      startAbs = dobAbs + Math.round(sa * 12);
    }

    let endAbsG: number | null = null;
    if (g.end_date) {
      const [ey, em] = parseYm(g.end_date);
      endAbsG = ymToAbs(ey, em);
    } else if (g.end_age != null) {
      endAbsG = dobAbs + Math.round(g.end_age * 12);
    }

    guaranteed.push({
      name: g.name,
      monthly: annual / 12,
      monthly_idx: monthlyIdx,
      start_abs: startAbs,
      end_abs: endAbsG,
      taxable: g.taxable ?? true,
    });
  }

  // ---- Build DC pot balances with pre-anchor growth ---- //
  const dcBalances: Record<string, number> = {};
  const dcMeta: Record<string, DcMeta> = {};
  for (const pot of cfg.dc_pots) {
    const name = pot.name;
    let balance = pot.starting_balance;
    const growth = resolveGrowthRate(pot);
    const fees = pot.annual_fees ?? 0.005;

    if (pot.values_as_of) {
      const [py, pm] = parseYm(pot.values_as_of);
      const gap = anchorAbs - ymToAbs(py, pm);
      if (gap > 0) {
        const mg = annualToMonthlyRate(growth);
        const mf = annualToMonthlyRate(fees);
        for (let i = 0; i < gap; i++) {
          balance = balance * (1 + mg) - balance * mf;
        }
      }
    }

    dcBalances[name] = balance;
    dcMeta[name] = {
      growth_rate: growth,
      annual_fees: fees,
      tax_free_portion: pot.tax_free_portion ?? 0.25,
      provenance: resolveGrowthProvenance(pot),
    };
  }

  // ---- Build tax-free account balances with pre-anchor growth ---- //
  const tfBalances: Record<string, number> = {};
  const tfMeta: Record<string, TfMeta> = {};
  for (const acc of cfg.tax_free_accounts) {
    const name = acc.name;
    let balance = acc.starting_balance;
    const growth = resolveGrowthRate(acc);

    if (acc.values_as_of) {
      const [ay, am] = parseYm(acc.values_as_of);
      const gap = anchorAbs - ymToAbs(ay, am);
      if (gap > 0) {
        const mg = annualToMonthlyRate(growth);
        for (let i = 0; i < gap; i++) {
          balance *= (1 + mg);
        }
      }
    }

    tfBalances[name] = balance;
    tfMeta[name] = {
      growth_rate: growth,
      provenance: resolveGrowthProvenance(acc),
    };
  }

  const priority = resolveSequentialDrawdownPriority(cfg);

  const pensionLedgerByPot: Record<string, PensionLedgerState> = {};
  for (const ledger of createInitialPensionLedgerStates(cfg)) {
    pensionLedgerByPot[ledger.pot_ref] = {
      ...ledger,
      uncrystallised_balance: dcBalances[ledger.pot_ref] ?? ledger.uncrystallised_balance,
      warnings: [...ledger.warnings],
    };
  }

  function updatePensionLedger(
    potRef: string,
    uncrystallisedDelta: number,
    taxFreeCashDelta = 0,
  ): void {
    const ledger = pensionLedgerByPot[potRef];
    if (!ledger) return;
    ledger.uncrystallised_balance = Math.max(0, ledger.uncrystallised_balance + uncrystallisedDelta);
    if (taxFreeCashDelta !== 0) {
      ledger.tax_free_cash_taken += taxFreeCashDelta;
    }
  }

  function applyPensionLedgerInvestmentReturn(potRef: string, delta: number): void {
    const ledger = pensionLedgerByPot[potRef];
    if (!ledger || delta === 0) return;
    const uncrystallisedBefore = Math.max(0, ledger.uncrystallised_balance);
    const crystallisedBefore = Math.max(0, ledger.crystallised_drawdown_balance);
    const totalBefore = uncrystallisedBefore + crystallisedBefore;

    if (totalBefore <= 0 || crystallisedBefore <= 0) {
      ledger.uncrystallised_balance = Math.max(0, ledger.uncrystallised_balance + delta);
      return;
    }

    const uncrystallisedDelta = delta * (uncrystallisedBefore / totalBefore);
    const crystallisedDelta = delta - uncrystallisedDelta;
    ledger.uncrystallised_balance = Math.max(0, ledger.uncrystallised_balance + uncrystallisedDelta);
    ledger.crystallised_drawdown_balance = Math.max(0, ledger.crystallised_drawdown_balance + crystallisedDelta);
  }

  // Pre-compute monthly rates
  const dcMonthly: Record<string, { growth: number; fees: number }> = {};
  for (const [name, meta] of Object.entries(dcMeta)) {
    dcMonthly[name] = {
      growth: annualToMonthlyRate(meta.growth_rate),
      fees: annualToMonthlyRate(meta.annual_fees),
    };
  }
  const tfMonthly: Record<string, { growth: number }> = {};
  for (const [name, meta] of Object.entries(tfMeta)) {
    tfMonthly[name] = {
      growth: annualToMonthlyRate(meta.growth_rate),
    };
  }

  // ---- State variables ---- //
  const years: YearRow[] = [];
  const warnings: string[] = [];
  let firstShortfallAge: number | null = null;
  let firstPotExhaustedAge: number | null = null;
  let totalTax = 0;
  const depletionEvents: DepletionEvent[] = [];
  const depletedPots = new Set<string>();

  // Monthly target
  let monthlyTarget = targetNetAnnual / 12;
  if (anchorAge > retirementAge) {
    const inflateMonths = anchorAbs - retAbs;
    for (let i = 0; i < inflateMonths; i++) {
      monthlyTarget *= (1 + monthlyCpi);
    }
  }

  // Annual aggregation state
  let currentAgg: AnnualAgg | null = null;
  let currentYearAge: number | null = null;
  let strategyMode = 'net';
  let strategyAmount = 0;
  let chartDeplCtr = 0;
  const recordedDrawdownStageTransitions = new Set<string>();
  const appliedPensionAccessEvents: PensionAccessResolvedEvent[] = [];
  for (const potRef of mixedPensionAccessPotRefs) {
    warnings.push(mixedPensionAccessModeWarning(potRef));
  }

  // Monthly rows
  const monthlyRows: MonthlyRow[] | null = includeMonthly ? [] : null;

  function newAgg(ageLabel: number, taxYearLabel: string, targetAnnual: number): AnnualAgg {
    const pnlInit: Record<string, { opening: number; growth: number; fees: number; withdrawal: number }> = {};
    for (const n of Object.keys(dcBalances)) {
      pnlInit[n] = { opening: dcBalances[n]!, growth: 0, fees: 0, withdrawal: 0 };
    }
    for (const n of Object.keys(tfBalances)) {
      pnlInit[n] = { opening: tfBalances[n]!, growth: 0, fees: 0, withdrawal: 0 };
    }
    return {
      age: ageLabel,
      tax_year: taxYearLabel,
      target_annual: targetAnnual,
      guaranteed_gross: 0,
      guaranteed_taxable: 0,
      guaranteed_detail: {},
      dc_gross: 0,
      dc_tf: 0,
      tf_total: 0,
      withdrawal_detail: {},
      pnl: pnlInit,
      months_counted: 0,
      monthly_target_sum: 0,
      drawdown_stage_transitions: [],
      drawdown_stage_allocations: [],
      pension_access_events: [],
      projection_warnings: [],
    };
  }

  function configuredPensionAccessEvent(eventId: string): PensionAccessEventConfig | undefined {
    return cfg.pension_access_events?.find(event => event.id === eventId);
  }

  function amountFromPensionAccessRule(
    event: PensionAccessEventConfig,
    potBalanceBefore: number,
    estimatedTfcRemaining: number,
  ): number {
    switch (event.amount.kind) {
      case 'fixed_amount':
        return event.amount.value;
      case 'percentage_of_pot':
        return potBalanceBefore * event.amount.value;
      case 'percentage_of_estimated_tfc_remaining':
        return estimatedTfcRemaining * event.amount.value;
    }
  }

  function applyPensionAccessEventsForMonth(absMonth: number): void {
    const [eventYear, eventMonth] = absToYm(absMonth);
    const dueEvents = pensionAccessEvents.filter(event =>
      Number(event.projection_year) === eventYear && event.month === eventMonth,
    );

    for (const baseEvent of dueEvents) {
      const configEvent = configuredPensionAccessEvent(baseEvent.id);
      const potBalanceBefore = dcBalances[baseEvent.pot_ref] ?? 0;
      let grossAmount = 0;
      let taxFreeAmount = 0;
      let taxableAmount = 0;
      let potBalanceAfter = potBalanceBefore;
      let uncrystallisedBalanceBefore: number | undefined;
      let uncrystallisedBalanceAfter: number | undefined;
      let crystallisedDrawdownBalanceBefore: number | undefined;
      let crystallisedDrawdownBalanceAfter: number | undefined;
      let estimatedTfcUsed = 0;
      let estimatedTfcRemaining = potBalanceBefore * (dcMeta[baseEvent.pot_ref]?.tax_free_portion ?? 0);
      const caveats: string[] = [];
      if (mixedPensionAccessPotRefs.has(baseEvent.pot_ref)) {
        caveats.push('ordinary_drawdown_also_targets_this_pot');
      }

      if (configEvent?.event_type === 'tax_free_cash' && potBalanceBefore > 0.01) {
        const requestedAmount = Math.max(0, amountFromPensionAccessRule(configEvent, potBalanceBefore, estimatedTfcRemaining));
        grossAmount = Math.min(requestedAmount, potBalanceBefore);
        taxFreeAmount = grossAmount;
        estimatedTfcUsed = Math.min(taxFreeAmount, estimatedTfcRemaining);
        estimatedTfcRemaining = Math.max(0, estimatedTfcRemaining - estimatedTfcUsed);
        potBalanceAfter = potBalanceBefore - grossAmount;
        dcBalances[baseEvent.pot_ref] = potBalanceAfter < 0.01 ? 0 : potBalanceAfter;
        updatePensionLedger(baseEvent.pot_ref, -grossAmount, taxFreeAmount);
        currentAgg!.pnl[baseEvent.pot_ref]!.withdrawal += grossAmount;
        caveats.push('simplified_tfc_event_no_lsa_lsdba_tracking');
        if (configEvent.destination?.kind && configEvent.destination.kind !== 'outside_plan') {
          caveats.push('destination_inside_plan_not_yet_modelled');
        }
      } else if (configEvent?.event_type === 'crystallise_and_take_pcls' && potBalanceBefore > 0.01) {
        const requestedCrystalliseAmount = Math.max(0, amountFromPensionAccessRule(configEvent, potBalanceBefore, estimatedTfcRemaining));
        const crystalliseAmount = Math.min(requestedCrystalliseAmount, potBalanceBefore);
        const ledger = pensionLedgerByPot[baseEvent.pot_ref];
        if (ledger && crystalliseAmount > 0.01) {
          uncrystallisedBalanceBefore = ledger.uncrystallised_balance;
          crystallisedDrawdownBalanceBefore = ledger.crystallised_drawdown_balance;
          const result = applyPensionLedgerEvent(ledger, {
            id: baseEvent.id,
            event_type: 'crystallise_and_take_pcls',
            date: `${eventYear}-${String(eventMonth).padStart(2, '0')}`,
            crystallise_amount: crystalliseAmount,
          });
          pensionLedgerByPot[baseEvent.pot_ref] = result.ledger;
          uncrystallisedBalanceAfter = result.ledger.uncrystallised_balance;
          crystallisedDrawdownBalanceAfter = result.ledger.crystallised_drawdown_balance;
          grossAmount = result.gross_amount;
          taxFreeAmount = result.tax_free_amount;
          estimatedTfcUsed = taxFreeAmount;
          estimatedTfcRemaining = Math.max(0, estimatedTfcRemaining - estimatedTfcUsed);
          potBalanceAfter = Math.max(0, potBalanceBefore - taxFreeAmount);
          dcBalances[baseEvent.pot_ref] = potBalanceAfter < 0.01 ? 0 : potBalanceAfter;
          currentAgg!.pnl[baseEvent.pot_ref]!.withdrawal += taxFreeAmount;
          caveats.push(...result.warnings);
          if (configEvent.destination?.kind && configEvent.destination.kind !== 'outside_plan') {
            caveats.push('destination_inside_plan_not_yet_modelled');
          }
        } else {
          grossAmount = baseEvent.gross_amount;
          caveats.push('foundation_only_not_applied');
        }
      } else if (configEvent?.event_type === 'taxable_flexi_access_drawdown' && potBalanceBefore > 0.01) {
        const ledger = pensionLedgerByPot[baseEvent.pot_ref];
        const requestedDrawdown = Math.max(0, amountFromPensionAccessRule(configEvent, potBalanceBefore, estimatedTfcRemaining));
        const drawdownAmount = Math.min(requestedDrawdown, ledger?.crystallised_drawdown_balance ?? 0);
        if (ledger && drawdownAmount > 0.01) {
          uncrystallisedBalanceBefore = ledger.uncrystallised_balance;
          crystallisedDrawdownBalanceBefore = ledger.crystallised_drawdown_balance;
          const result = applyPensionLedgerEvent(ledger, {
            id: baseEvent.id,
            event_type: 'taxable_flexi_access_drawdown',
            date: `${eventYear}-${String(eventMonth).padStart(2, '0')}`,
            gross_amount: drawdownAmount,
          });
          pensionLedgerByPot[baseEvent.pot_ref] = result.ledger;
          uncrystallisedBalanceAfter = result.ledger.uncrystallised_balance;
          crystallisedDrawdownBalanceAfter = result.ledger.crystallised_drawdown_balance;
          grossAmount = result.gross_amount;
          taxFreeAmount = result.tax_free_amount;
          taxableAmount = result.taxable_amount;
          potBalanceAfter = Math.max(0, potBalanceBefore - grossAmount);
          dcBalances[baseEvent.pot_ref] = potBalanceAfter < 0.01 ? 0 : potBalanceAfter;
          currentAgg!.dc_gross += grossAmount;
          currentAgg!.withdrawal_detail[baseEvent.pot_ref] = (currentAgg!.withdrawal_detail[baseEvent.pot_ref] ?? 0) + grossAmount;
          currentAgg!.pnl[baseEvent.pot_ref]!.withdrawal += grossAmount;
          caveats.push(...result.warnings);
          if (requestedDrawdown > drawdownAmount + 0.01) {
            caveats.push('crystallised_balance_insufficient_for_drawdown');
          }
          if (configEvent.destination?.kind && configEvent.destination.kind !== 'outside_plan') {
            caveats.push('destination_inside_plan_not_yet_modelled');
          }
        } else {
          grossAmount = 0;
          caveats.push('crystallised_balance_insufficient_for_drawdown');
        }
      } else {
        grossAmount = baseEvent.gross_amount;
        caveats.push('foundation_only_not_applied');
      }

      const appliedEvent: PensionAccessResolvedEvent = {
        ...baseEvent,
        gross_amount: grossAmount,
        tax_free_amount: taxFreeAmount,
        taxable_amount: taxableAmount,
        pot_balance_before: potBalanceBefore,
        pot_balance_after: potBalanceAfter,
        uncrystallised_balance_before: uncrystallisedBalanceBefore,
        uncrystallised_balance_after: uncrystallisedBalanceAfter,
        crystallised_drawdown_balance_before: crystallisedDrawdownBalanceBefore,
        crystallised_drawdown_balance_after: crystallisedDrawdownBalanceAfter,
        estimated_tfc_used: estimatedTfcUsed,
        estimated_tfc_remaining: estimatedTfcRemaining,
        caveats,
      };

      currentAgg!.pension_access_events.push(appliedEvent);
      appliedPensionAccessEvents.push(appliedEvent);
    }
  }

  function estimateGuaranteedForProjectionYear(startAbs: number): { gross: number; taxable: number } {
    let gross = 0;
    let taxable = 0;

    for (const gi of guaranteed) {
      let monthly = gi.monthly;

      for (let offset = 0; offset < 12; offset++) {
        const monthAbs = startAbs + offset;
        const active = monthAbs >= gi.start_abs && (gi.end_abs === null || monthAbs <= gi.end_abs);

        if (active) {
          gross += monthly;
          if (gi.taxable) taxable += monthly;
        }

        monthly *= (1 + gi.monthly_idx);
      }
    }

    return { gross, taxable };
  }

  // ---- MAIN MONTHLY LOOP ---- //
  for (let absM = anchorAbs; absM <= endAbs; absM++) {
    const [calY, calM] = absToYm(absM);
    const yearAge = anchorAge + Math.floor((absM - anchorAbs) / 12);

    // ---- Year boundary ---- //
    if (yearAge !== currentYearAge) {
      if (currentAgg !== null) {
        // Finalise previous year
        const yearTax = calculateAnnualTaxFromEvents(currentAgg, taxCfg);
        const yrRow = buildYearRow(currentAgg, dcBalances, tfBalances, dcMeta, tfMeta, yearTax);
        years.push(yrRow);
        totalTax += yearTax.total;
        if (yrRow.shortfall && firstShortfallAge === null) {
          firstShortfallAge = yrRow.age;
        }

        // Strategy feedback for GK
        if (strategyId === 'guyton_klinger' && strategyState !== null) {
          const actualGross = currentAgg.dc_gross + currentAgg.tf_total;
          const portfolioAtStart = Object.values(currentAgg.pnl).reduce(
            (sum, p) => sum + p.opening, 0);
          (strategyState as Record<string, unknown>).prev_gross = actualGross;
          if ((strategyState as Record<string, unknown>).starting_rate == null && portfolioAtStart > 0) {
            (strategyState as Record<string, unknown>).starting_rate = actualGross / portfolioAtStart;
          }
        }
      }

      // New year setup
      currentYearAge = yearAge;

      // Backtest schedule overrides
      for (const name of Object.keys(dcMeta)) {
        const sched = cfg._dc_growth_schedules?.[name];
        if (sched && sched[yearAge] !== undefined) {
          dcMeta[name]!.growth_rate = sched[yearAge]!;
          dcMonthly[name]!.growth = annualToMonthlyRate(sched[yearAge]!);
        }
      }
      for (const name of Object.keys(tfMeta)) {
        const sched = cfg._tf_growth_schedules?.[name];
        if (sched && sched[yearAge] !== undefined) {
          tfMeta[name]!.growth_rate = sched[yearAge]!;
          tfMonthly[name]!.growth = annualToMonthlyRate(sched[yearAge]!);
        }
      }
      if (cpiRateSchedule[yearAge] !== undefined) {
        cpi = cpiRateSchedule[yearAge]!;
        monthlyCpi = annualToMonthlyRate(cpi);
      }

      const yearOffset = yearAge - anchorAge;
      const cy = isPostRetirement ? calY : retY + yearOffset;
      const taxYearLabel = `${cy}/${String(cy + 1).slice(-2)}`;

      // Estimate guaranteed income for the actual projection months in this year.
      const { gross: estGuarGross, taxable: estGuarTaxable } =
        estimateGuaranteedForProjectionYear(absM);

      // Strategy dispatch
      const portfolioValue = sumValues(dcBalances) + sumValues(tfBalances);
      let targetAnnual: number;

      if (strategyId === 'fixed_target') {
        targetAnnual = monthlyTarget * 12;
      } else {
        const [targetDict, newState] = computeAnnualTarget(
          strategyId, strategyParams, strategyState,
          portfolioValue, cpi, yearAge, configEndAge);
        // Validate strategy output
        const stratErrors = validateStrategyOutput(targetDict, strategyId);
        if (stratErrors.length > 0) {
          console.warn(`[projection] strategy output validation age ${yearAge}:`, stratErrors);
        }
        strategyState = newState;
        strategyMode = targetDict.mode;
        strategyAmount = targetDict.annual_amount;
        targetAnnual = strategyAmount;
      }

      currentAgg = newAgg(yearAge, taxYearLabel,
        strategyId === 'fixed_target' ? targetAnnual : strategyAmount);

      // Annual target setup
      if (strategyId === 'fixed_target') {
        // target already set
      } else if (strategyMode === 'pot_net') {
        const taxOnGuar = calculateTax(estGuarTaxable, taxCfg).total;
        const guarNet = estGuarGross - taxOnGuar;
        targetAnnual = strategyAmount + guarNet;
        currentAgg.target_annual = targetAnnual;
        monthlyTarget = targetAnnual / 12;
      } else if (strategyMode === 'net') {
        targetAnnual = strategyAmount;
        currentAgg.target_annual = targetAnnual;
        monthlyTarget = targetAnnual / 12;
      } else {
        // gross mode
        const totalDcBal = Object.values(dcBalances).reduce((s, v) => s + Math.max(0, v), 0);
        const totalTfBal = Object.values(tfBalances).reduce((s, v) => s + Math.max(0, v), 0);
        const totalPots = totalDcBal + totalTfBal;
        const achievable = Math.min(strategyAmount, totalPots);
        let dcFrac = 0;
        let wavgTfp = 0.25;
        if (totalDcBal > 0 && totalPots > 0) {
          dcFrac = totalDcBal / totalPots;
          wavgTfp = Object.entries(dcBalances).reduce(
            (s, [n, b]) => s + dcMeta[n]!.tax_free_portion * Math.max(0, b), 0) / totalDcBal;
        }
        const estDcTaxable = achievable * dcFrac * (1 - wavgTfp);
        const totalTaxableEst = estGuarTaxable + estDcTaxable;
        const taxEst = calculateTax(totalTaxableEst, taxCfg).total;
        const estNet = estGuarGross + achievable - taxEst;
        targetAnnual = estNet;
        currentAgg.target_annual = targetAnnual;
        monthlyTarget = targetAnnual / 12;
      }
    }

    // Per-month tracking
    const monthlyGuaranteedDetail: Record<string, number> = {};
    const monthlyWithdrawalDetail: Record<string, number> = {};
    let monthlyGrossIncome = 0;

    // ---- Step 1: Monthly growth and fees ---- //
    for (const name of Object.keys(dcBalances)) {
      const bal = dcBalances[name]!;
      if (bal > 0) {
        const g = bal * dcMonthly[name]!.growth;
        const f = bal * dcMonthly[name]!.fees;
        dcBalances[name] = bal + g - f;
        applyPensionLedgerInvestmentReturn(name, g - f);
        currentAgg!.pnl[name]!.growth += g;
        currentAgg!.pnl[name]!.fees += f;
      }
    }
    for (const name of Object.keys(tfBalances)) {
      const bal = tfBalances[name]!;
      if (bal > 0) {
        const g = bal * tfMonthly[name]!.growth;
        tfBalances[name] = bal + g;
        currentAgg!.pnl[name]!.growth += g;
      }
    }

    // ---- Step 1b: Explicit pension access / tax-free cash events ---- //
    // These are separate capital events, not ordinary income. They reduce the
    // pension pot balance and are shown in structured workings, but do not add
    // to dc_gross, withdrawal_detail, monthly income, or taxable income.
    applyPensionAccessEventsForMonth(absM);

    // ---- Step 2: Monthly guaranteed income ---- //
    for (const gi of guaranteed) {
      const active = absM >= gi.start_abs && (gi.end_abs === null || absM <= gi.end_abs);
      if (active) {
        const amt = gi.monthly;
        currentAgg!.guaranteed_gross += amt;
        monthlyGuaranteedDetail[gi.name] = amt;
        monthlyGrossIncome += amt;
        if (gi.taxable) {
          currentAgg!.guaranteed_taxable += amt;
        }
        currentAgg!.guaranteed_detail[gi.name] = (currentAgg!.guaranteed_detail[gi.name] ?? 0) + amt;
      } else {
        if (!(gi.name in currentAgg!.guaranteed_detail)) {
          currentAgg!.guaranteed_detail[gi.name] = 0;
        }
      }
      // Monthly indexation
      if (gi.monthly_idx > 0) {
        gi.monthly *= (1 + gi.monthly_idx);
      }
    }

    // ---- Step 3: Monthly source allocation ---- //
    const guarGrossMo = Object.values(monthlyGuaranteedDetail).reduce((s, v) => s + v, 0);
    const guarTaxableMo = guaranteed
      .filter(gi => gi.name in monthlyGuaranteedDetail && gi.taxable)
      .reduce((s, gi) => s + (monthlyGuaranteedDetail[gi.name] ?? 0), 0);

    // Annualised DC gross-up ratio (PAYE-like)
    const estGuarTaxableM = guarTaxableMo * 12;
    const annualTaxOnGuar = calculateTax(estGuarTaxableM, taxCfg).total;
    let monthlyTaxableBaseAnnual = estGuarTaxableM;

    const useGrossMode = strategyId !== 'fixed_target' && strategyMode === 'gross';
    const drawdownStages = cfg.drawdown_stages ?? [];
    const useBlendedStages = hasBlendedDrawdownStages(drawdownStages);

    function recordStageAllocation(
      stage: DrawdownStageConfig,
      stageIndex: number,
      source: DrawdownStageSourceConfig,
      actualGross: number,
      actualNet: number,
      taxFreeAmount: number,
      taxableAmount: number,
    ): void {
      const existing = currentAgg!.drawdown_stage_allocations.find(allocation =>
        allocation.stage_id === stage.id
        && allocation.source_type === source.source_type
        && allocation.source_name === source.source_name,
      );

      if (existing) {
        existing.actual_gross_withdrawal += actualGross;
        existing.actual_net_income += actualNet;
        existing.tax_free_amount += taxFreeAmount;
        existing.taxable_amount += taxableAmount;
        return;
      }

      currentAgg!.drawdown_stage_allocations.push({
        stage_id: stage.id,
        stage_name: drawdownStageDisplayName(stage, stageIndex),
        source_type: source.source_type,
        source_name: source.source_name,
        target_share: source.target_share,
        actual_gross_withdrawal: actualGross,
        actual_net_income: actualNet,
        tax_free_amount: taxFreeAmount,
        taxable_amount: taxableAmount,
      });
    }

    function netFromDcWithdrawal(gross: number, taxFreePortion: number): number {
      const taxableAnnual = gross * 12 * (1 - taxFreePortion);
      const taxBefore = calculateTax(monthlyTaxableBaseAnnual, taxCfg).total;
      const taxAfter = calculateTax(monthlyTaxableBaseAnnual + taxableAnnual, taxCfg).total;
      monthlyTaxableBaseAnnual += taxableAnnual;
      return gross - ((taxAfter - taxBefore) / 12);
    }

    function isLedgerAwareOrdinaryFadPot(sourceName: string): boolean {
      return ledgerAwareOrdinaryFadPotRefs.has(sourceName);
    }

    function availableOrdinaryFadBalance(sourceName: string): number {
      if (!isLedgerAwareOrdinaryFadPot(sourceName)) return dcBalances[sourceName] ?? 0;
      const ledger = pensionLedgerByPot[sourceName];
      return Math.min(dcBalances[sourceName] ?? 0, ledger?.crystallised_drawdown_balance ?? 0);
    }

    function recordLedgerAwareFadShortfall(sourceName: string): void {
      const code = 'ledger_aware_fad_insufficient_crystallised_balance';
      const message = `Ledger-aware FAD shortfall: ${sourceName} ordinary withdrawals requested crystallised drawdown, but crystallised drawdown balance was insufficient; no auto-crystallisation or pro-rata fallback was applied.`;
      if (!currentAgg!.projection_warnings.includes(code)) {
        currentAgg!.projection_warnings.push(code);
      }
      if (!warnings.includes(message)) {
        warnings.push(message);
      }
    }

    function applyOrdinaryFadWithdrawalToLedger(sourceName: string, grossAmount: number): void {
      if (!isLedgerAwareOrdinaryFadPot(sourceName) || grossAmount <= 0.01) return;
      const ledger = pensionLedgerByPot[sourceName];
      if (!ledger) return;
      ledger.crystallised_drawdown_balance = Math.max(0, ledger.crystallised_drawdown_balance - grossAmount);
      ledger.taxable_drawdown_taken += grossAmount;
      if (!ledger.mpaa_triggered) {
        const [withdrawalYear, withdrawalMonth] = absToYm(absM);
        ledger.mpaa_triggered = true;
        ledger.mpaa_trigger_date = `${withdrawalYear}-${String(withdrawalMonth).padStart(2, '0')}`;
      }
    }

    if (useGrossMode) {
      // GROSS mode: fixed monthly pot withdrawal target
      let remaining = Math.max(0, strategyAmount / 12);

      function withdrawGrossDc(
        sourceName: string,
        grossNeeded: number,
        allocationSource?: DrawdownStageSourceConfig,
        allocationStage?: DrawdownStageConfig,
        allocationStageIndex = 0,
      ): number {
        const available = availableOrdinaryFadBalance(sourceName);
        if (isLedgerAwareOrdinaryFadPot(sourceName) && grossNeeded > available + 0.01) {
          recordLedgerAwareFadShortfall(sourceName);
        }
        const actual = Math.min(grossNeeded, available);
        if (actual <= 0.01) return 0;
        dcBalances[sourceName] = dcBalances[sourceName]! - actual;
        if (isLedgerAwareOrdinaryFadPot(sourceName)) {
          applyOrdinaryFadWithdrawalToLedger(sourceName, actual);
        } else {
          updatePensionLedger(sourceName, -actual);
        }
        if (dcBalances[sourceName]! < 0.01) dcBalances[sourceName] = 0;
        const tfp = isLedgerAwareOrdinaryFadPot(sourceName) ? 0 : dcMeta[sourceName]!.tax_free_portion;
        currentAgg!.dc_gross += actual;
        currentAgg!.dc_tf += actual * tfp;
        const netFromDc = netFromDcWithdrawal(actual, tfp);
        if (allocationSource && allocationStage) {
          recordStageAllocation(
            allocationStage,
            allocationStageIndex,
            allocationSource,
            actual,
            netFromDc,
            actual * tfp,
            actual * (1 - tfp),
          );
        }
        currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + netFromDc;
        currentAgg!.pnl[sourceName]!.withdrawal += actual;
        monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + netFromDc;
        monthlyGrossIncome += actual;
        return actual;
      }

      function withdrawGrossTf(
        sourceName: string,
        grossNeeded: number,
        allocationSource?: DrawdownStageSourceConfig,
        allocationStage?: DrawdownStageConfig,
        allocationStageIndex = 0,
      ): number {
        const available = tfBalances[sourceName]!;
        const actual = Math.min(grossNeeded, available);
        if (actual <= 0.01) return 0;
        tfBalances[sourceName] = tfBalances[sourceName]! - actual;
        if (tfBalances[sourceName]! < 0.01) tfBalances[sourceName] = 0;
        currentAgg!.tf_total += actual;
        if (allocationSource && allocationStage) {
          recordStageAllocation(
            allocationStage,
            allocationStageIndex,
            allocationSource,
            actual,
            actual,
            actual,
            0,
          );
        }
        currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + actual;
        currentAgg!.pnl[sourceName]!.withdrawal += actual;
        monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + actual;
        monthlyGrossIncome += actual;
        return actual;
      }

      if (useBlendedStages) {
        remaining = allocateBlendedGrossWithdrawal({
          stages: drawdownStages,
          remainingGross: remaining,
          month: ((absM - anchorAbs) % 12) + 1,
          recordedTransitionKeys: recordedDrawdownStageTransitions,
          sourceBalance: source => source.source_type === 'dc_pot'
            ? (dcBalances[source.source_name] ?? 0)
            : (tfBalances[source.source_name] ?? 0),
          withdrawSource: (source, grossNeeded, stage, stageIndex) => source.source_type === 'dc_pot'
            ? withdrawGrossDc(source.source_name, grossNeeded, source, stage, stageIndex)
            : withdrawGrossTf(source.source_name, grossNeeded, source, stage, stageIndex),
          recordTransition: transition => currentAgg!.drawdown_stage_transitions.push(transition),
        });
      } else {
        for (const sourceName of priority) {
          if (remaining <= 0.01) break;
          if (sourceName in dcBalances && dcBalances[sourceName]! > 0.01) {
            const actual = withdrawGrossDc(sourceName, remaining);
            remaining -= actual;
          } else if (sourceName in tfBalances && tfBalances[sourceName]! > 0.01) {
            const actual = withdrawGrossTf(sourceName, remaining);
            remaining -= actual;
          }
        }
      }
    } else {
      // NET mode
      const guarNetMo = guarGrossMo - (annualTaxOnGuar / 12);
      let remainingNet = Math.max(0, monthlyTarget - guarNetMo);

      function withdrawDc(
        sourceName: string,
        netNeeded: number,
        allocationSource?: DrawdownStageSourceConfig,
        allocationStage?: DrawdownStageConfig,
        allocationStageIndex = 0,
      ): number {
        const tfp = isLedgerAwareOrdinaryFadPot(sourceName) ? 0 : dcMeta[sourceName]!.tax_free_portion;
        let grossNeeded: number;
        const taxableIfNetAsGross = netNeeded * 12 * (1 - tfp);
        const taxBefore = calculateTax(monthlyTaxableBaseAnnual, taxCfg).total;
        const taxIfNetAsGross = calculateTax(monthlyTaxableBaseAnnual + taxableIfNetAsGross, taxCfg).total;
        if (Math.abs(taxIfNetAsGross - taxBefore) < 0.005) {
          grossNeeded = netNeeded;
        } else {
          grossNeeded = grossUp(netNeeded * 12, monthlyTaxableBaseAnnual, tfp, taxCfg) / 12;
        }
        const available = availableOrdinaryFadBalance(sourceName);
        if (isLedgerAwareOrdinaryFadPot(sourceName) && grossNeeded > available + 0.01) {
          recordLedgerAwareFadShortfall(sourceName);
        }
        grossNeeded = Math.min(grossNeeded, available);
        if (grossNeeded <= 0.01) return 0;
        dcBalances[sourceName] = dcBalances[sourceName]! - grossNeeded;
        if (isLedgerAwareOrdinaryFadPot(sourceName)) {
          applyOrdinaryFadWithdrawalToLedger(sourceName, grossNeeded);
        } else {
          updatePensionLedger(sourceName, -grossNeeded);
        }
        if (dcBalances[sourceName]! < 0.01) dcBalances[sourceName] = 0;
        const tfpAmt = grossNeeded * tfp;
        currentAgg!.dc_gross += grossNeeded;
        currentAgg!.dc_tf += tfpAmt;
        const netFromThis = netFromDcWithdrawal(grossNeeded, tfp);
        if (allocationSource && allocationStage) {
          recordStageAllocation(
            allocationStage,
            allocationStageIndex,
            allocationSource,
            grossNeeded,
            netFromThis,
            tfpAmt,
            grossNeeded - tfpAmt,
          );
        }
        currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + netFromThis;
        currentAgg!.pnl[sourceName]!.withdrawal += grossNeeded;
        monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + netFromThis;
        monthlyGrossIncome += grossNeeded;
        return netFromThis;
      }

      function withdrawTf(
        sourceName: string,
        netNeeded: number,
        allocationSource?: DrawdownStageSourceConfig,
        allocationStage?: DrawdownStageConfig,
        allocationStageIndex = 0,
      ): number {
        const available = tfBalances[sourceName]!;
        const actual = Math.min(netNeeded, available);
        if (actual <= 0.01) return 0;
        tfBalances[sourceName] = tfBalances[sourceName]! - actual;
        if (tfBalances[sourceName]! < 0.01) tfBalances[sourceName] = 0;
        currentAgg!.tf_total += actual;
        if (allocationSource && allocationStage) {
          recordStageAllocation(
            allocationStage,
            allocationStageIndex,
            allocationSource,
            actual,
            actual,
            actual,
            0,
          );
        }
        currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + actual;
        currentAgg!.pnl[sourceName]!.withdrawal += actual;
        monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + actual;
        monthlyGrossIncome += actual;
        return actual;
      }

      if (useBlendedStages) {
        remainingNet = allocateBlendedNetWithdrawal({
          stages: drawdownStages,
          remainingNet,
          month: ((absM - anchorAbs) % 12) + 1,
          recordedTransitionKeys: recordedDrawdownStageTransitions,
          sourceBalance: source => source.source_type === 'dc_pot'
            ? (dcBalances[source.source_name] ?? 0)
            : (tfBalances[source.source_name] ?? 0),
          withdrawSource: (source, netNeeded, stage, stageIndex) => source.source_type === 'dc_pot'
            ? withdrawDc(source.source_name, netNeeded, source, stage, stageIndex)
            : withdrawTf(source.source_name, netNeeded, source, stage, stageIndex),
          recordTransition: transition => currentAgg!.drawdown_stage_transitions.push(transition),
        });
      } else {
        for (const sourceName of priority) {
          if (remainingNet <= 0.01) break;
          if (sourceName in dcBalances && dcBalances[sourceName]! > 0.01) {
            const netFromThis = withdrawDc(sourceName, remainingNet);
            remainingNet = Math.max(0, remainingNet - netFromThis);
          } else if (sourceName in tfBalances && tfBalances[sourceName]! > 0.01) {
            const netFromThis = withdrawTf(sourceName, remainingNet);
            remainingNet = Math.max(0, remainingNet - netFromThis);
          }
        }
      }
    }

    // ---- Step 3b: Residual cleardown ---- //
    // If a pot balance is small but non-zero after withdrawal, sweep it into
    // income and close the pot.  Mirrors real-world provider behaviour.
    const CLEARDOWN_THRESHOLD = 50;
    for (const pname of Object.keys(dcBalances)) {
      const bal = dcBalances[pname]!;
      if (bal > 0.01 && bal < CLEARDOWN_THRESHOLD && !depletedPots.has(pname)) {
        const tfp = dcMeta[pname]!.tax_free_portion;
        currentAgg!.dc_gross += bal;
        currentAgg!.dc_tf += bal * tfp;
        const netFromRes = netFromDcWithdrawal(bal, tfp);
        currentAgg!.withdrawal_detail[pname] = (currentAgg!.withdrawal_detail[pname] ?? 0) + netFromRes;
        currentAgg!.pnl[pname]!.withdrawal += bal;
        monthlyWithdrawalDetail[pname] = (monthlyWithdrawalDetail[pname] ?? 0) + netFromRes;
        monthlyGrossIncome += bal;
        updatePensionLedger(pname, -bal);
        dcBalances[pname] = 0;
      }
    }
    for (const pname of Object.keys(tfBalances)) {
      const bal = tfBalances[pname]!;
      if (bal > 0.01 && bal < CLEARDOWN_THRESHOLD && !depletedPots.has(pname)) {
        currentAgg!.tf_total += bal;
        currentAgg!.withdrawal_detail[pname] = (currentAgg!.withdrawal_detail[pname] ?? 0) + bal;
        currentAgg!.pnl[pname]!.withdrawal += bal;
        monthlyWithdrawalDetail[pname] = (monthlyWithdrawalDetail[pname] ?? 0) + bal;
        monthlyGrossIncome += bal;
        tfBalances[pname] = 0;
      }
    }

    // ---- Step 4: Depletion detection ---- //
    for (const pname of Object.keys(dcBalances)) {
      if (dcBalances[pname]! <= 0 && !depletedPots.has(pname)) {
        depletedPots.add(pname);
        const monthInYear = ((absM - anchorAbs) % 12) + 1;
        depletionEvents.push({ pot: pname, age: yearAge, month: monthInYear });
        if (firstPotExhaustedAge === null) firstPotExhaustedAge = yearAge;
        warnings.push(`${pname} exhausted at age ${yearAge} month ${monthInYear}`);
      }
    }
    for (const pname of Object.keys(tfBalances)) {
      if (tfBalances[pname]! <= 0 && !depletedPots.has(pname)) {
        depletedPots.add(pname);
        const monthInYear = ((absM - anchorAbs) % 12) + 1;
        depletionEvents.push({ pot: pname, age: yearAge, month: monthInYear });
        if (firstPotExhaustedAge === null) firstPotExhaustedAge = yearAge;
        warnings.push(`${pname} exhausted at age ${yearAge} month ${monthInYear}`);
      }
    }

    // ---- Step 5: Track actual target used this month, then apply CPI ---- //
    currentAgg!.monthly_target_sum += monthlyTarget;
    if (strategyId === 'fixed_target') {
      currentAgg!.target_annual = currentAgg!.monthly_target_sum;
    }
    currentAgg!.months_counted++;
    if (useMonthlyFromCpi) {
      monthlyTarget *= (1 + monthlyCpi);
    }

    // ---- Step 6: Collect monthly row ---- //
    if (monthlyRows !== null) {
      const monthInYear = ((absM - anchorAbs) % 12) + 1;
      monthlyRows.push({
        year: calY,
        month: calM,
        age: yearAge,
        month_in_year: monthInYear,
        target_monthly: round2(monthlyTarget / (1 + monthlyCpi)),
        guaranteed_detail: Object.fromEntries(
          Object.entries(monthlyGuaranteedDetail).map(([k, v]) => [k, round2(v)])),
        guaranteed_total: round2(Object.values(monthlyGuaranteedDetail).reduce((s, v) => s + v, 0)),
        withdrawal_detail: Object.fromEntries(
          Object.entries(monthlyWithdrawalDetail).map(([k, v]) => [k, round2(v)])),
        withdrawal_total: round2(Object.values(monthlyWithdrawalDetail).reduce((s, v) => s + v, 0)),
        gross_income: round2(monthlyGrossIncome),
        dc_balances: Object.fromEntries(Object.entries(dcBalances).map(([n, b]) => [n, round2(b)])),
        tf_balances: Object.fromEntries(Object.entries(tfBalances).map(([n, b]) => [n, round2(b)])),
        total_capital: round2(sumValues(dcBalances) + sumValues(tfBalances)),
        depleted_this_month: depletionEvents
          .filter(e => e.age === yearAge && e.month === monthInYear)
          .map(e => e.pot),
      });
    }

    // ---- Early exit for extended chart projection ---- //
    // Keep this after annual and monthly aggregation so the final partial year
    // reconciles with the emitted MonthlyRow data.
    if (includeMonthly && yearAge > configEndAge) {
      const totalCapital = Object.values(dcBalances).reduce((s, v) => s + Math.max(0, v), 0)
        + Object.values(tfBalances).reduce((s, v) => s + Math.max(0, v), 0);
      if (totalCapital < 0.01) {
        chartDeplCtr++;
        if (chartDeplCtr >= 24) break;
      } else {
        chartDeplCtr = 0;
      }
    }
  }

  // ---- Finalise last year ---- //
  if (currentAgg !== null && currentAgg.months_counted > 0) {
    const finalTax = calculateAnnualTaxFromEvents(currentAgg, taxCfg);
    const yrRow = buildYearRow(currentAgg, dcBalances, tfBalances, dcMeta, tfMeta, finalTax);
    years.push(yrRow);
    totalTax += finalTax.total;
    if (yrRow.shortfall && firstShortfallAge === null) {
      firstShortfallAge = yrRow.age;
    }
  }

  // ARVA tolerance
  if (firstShortfallAge !== null
    && (strategyId === 'arva' || strategyId === 'arva_guardrails')
    && firstShortfallAge >= configEndAge - 1) {
    firstShortfallAge = null;
  }

  // Summary
  const totalTaxableSum = years.reduce((s, y) => s + y.total_taxable_income, 0);
  const summary: ProjectionSummary = {
    sustainable: firstShortfallAge === null,
    first_shortfall_age: firstShortfallAge,
    end_age: configEndAge,
    anchor_age: anchorAge,
    is_post_retirement: isPostRetirement,
    num_years: years.length,
    remaining_capital: round2(sumValues(dcBalances) + sumValues(tfBalances)),
    remaining_pots: Object.fromEntries(Object.entries(dcBalances).map(([n, b]) => [n, round2(b)])),
    remaining_tf: Object.fromEntries(Object.entries(tfBalances).map(([n, b]) => [n, round2(b)])),
    total_tax_paid: round2(totalTax),
    avg_effective_tax_rate: totalTaxableSum > 0
      ? round2((totalTax / totalTaxableSum) * 100)
      : 0,
    first_pot_exhausted_age: firstPotExhaustedAge,
    depletion_events: depletionEvents,
  };

  const pensionLedgerStates = Object.values(pensionLedgerByPot).map(roundPensionLedgerState);
  const result: ProjectionResult = {
    years,
    summary,
    warnings,
    pension_ledger_states: pensionLedgerStates,
    pension_ledger_summary: summarizePensionLedgerStates(pensionLedgerStates),
  };
  if (appliedPensionAccessEvents.length > 0) {
    result.pension_access_events = appliedPensionAccessEvents;
  }
  if (monthlyRows !== null) {
    result.monthly_rows = monthlyRows;
  }
  return result;
}
