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
  TaxResult,
  YearRow,
  PotPnl,
  ProjectionResult,
  ProjectionSummary,
  MonthlyRow,
  DepletionEvent,
  GrowthProvenance,
  StrategyState,
} from './types';

import { calculateTax, grossUp } from './tax';
import { normalizeConfig, computeAnnualTarget } from './strategies';

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

function sumValues(obj: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(obj)) {
    total += v;
  }
  return total;
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

  return {
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
    shortfall: netIncome < agg.target_annual - 1,
    pot_balances: Object.fromEntries(
      Object.entries(dcBalances).map(([n, b]) => [n, round2(b)])
    ),
    tf_balances: Object.fromEntries(
      Object.entries(tfBalances).map(([n, b]) => [n, round2(b)])
    ),
    total_capital: round2(totalCapital),
    pot_pnl: potPnl,
  };
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

  const { includeMonthly = false, initialStrategyState = null } = options;
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
  const configEndAge = endAgeCfg;
  let endAge = endAgeCfg;
  if (includeMonthly) {
    endAge = Math.min(120, Math.max(endAge, 120));
  }
  const endAbs = anchorAbs + (endAge - anchorAge + 1) * 12 - 1;

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

  const priority = cfg.withdrawal_priority ?? [];

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
    };
  }

  // ---- MAIN MONTHLY LOOP ---- //
  for (let absM = anchorAbs; absM <= endAbs; absM++) {
    const [calY, calM] = absToYm(absM);
    const yearAge = anchorAge + Math.floor((absM - anchorAbs) / 12);

    // ---- Year boundary ---- //
    if (yearAge !== currentYearAge) {
      if (currentAgg !== null) {
        // Finalise previous year
        const totalTaxableYr = currentAgg.guaranteed_taxable
          + (currentAgg.dc_gross - currentAgg.dc_tf);
        const yearTax = calculateTax(totalTaxableYr, taxCfg);
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

      // Estimate guaranteed income for this year
      let estGuarGross = 0;
      let estGuarTaxable = 0;
      for (const gi of guaranteed) {
        const active = absM >= gi.start_abs && (gi.end_abs === null || absM <= gi.end_abs);
        if (active) {
          estGuarGross += gi.monthly * 12;
          if (gi.taxable) estGuarTaxable += gi.monthly * 12;
        }
      }

      // Strategy dispatch
      const portfolioValue = sumValues(dcBalances) + sumValues(tfBalances);
      let targetAnnual: number;

      if (strategyId === 'fixed_target') {
        targetAnnual = monthlyTarget * 12;
      } else {
        const [targetDict, newState] = computeAnnualTarget(
          strategyId, strategyParams, strategyState,
          portfolioValue, cpi, yearAge);
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
    const estGuarGrossM = guarGrossMo * 12;
    const annualTaxOnGuar = calculateTax(estGuarTaxableM, taxCfg).total;
    const netFromGuarM = estGuarGrossM - annualTaxOnGuar;
    const annualShortfallM = Math.max(0, monthlyTarget * 12 - netFromGuarM);
    const totalDcBal = Object.values(dcBalances).reduce((s, v) => s + Math.max(0, v), 0);

    let dcGrossPerNet = 1;
    if (annualShortfallM > 0.01 && totalDcBal > 0.01) {
      const wavgTfp = Object.entries(dcBalances)
        .filter(([_, b]) => b > 0.01)
        .reduce((s, [n, b]) => s + dcMeta[n]!.tax_free_portion * Math.max(0, b), 0) / totalDcBal;
      const dcGrossAnnual = grossUp(annualShortfallM, estGuarTaxableM, wavgTfp, taxCfg);
      dcGrossPerNet = dcGrossAnnual / annualShortfallM;
    }

    const useGrossMode = strategyId !== 'fixed_target' && strategyMode === 'gross';

    if (useGrossMode) {
      // GROSS mode: fixed monthly pot withdrawal target
      let remaining = Math.max(0, strategyAmount / 12);

      for (const sourceName of priority) {
        if (remaining <= 0.01) break;
        if (sourceName in dcBalances && dcBalances[sourceName]! > 0.01) {
          const available = dcBalances[sourceName]!;
          const actual = Math.min(remaining, available);
          dcBalances[sourceName] = dcBalances[sourceName]! - actual;
          if (dcBalances[sourceName]! < 0.01) dcBalances[sourceName] = 0;
          const tfp = dcMeta[sourceName]!.tax_free_portion;
          currentAgg!.dc_gross += actual;
          currentAgg!.dc_tf += actual * tfp;
          const netFromDc = actual / dcGrossPerNet;
          currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + netFromDc;
          currentAgg!.pnl[sourceName]!.withdrawal += actual;
          monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + netFromDc;
          monthlyGrossIncome += actual;
          remaining -= actual;
        } else if (sourceName in tfBalances && tfBalances[sourceName]! > 0.01) {
          const available = tfBalances[sourceName]!;
          const actual = Math.min(remaining, available);
          tfBalances[sourceName] = tfBalances[sourceName]! - actual;
          if (tfBalances[sourceName]! < 0.01) tfBalances[sourceName] = 0;
          currentAgg!.tf_total += actual;
          currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + actual;
          currentAgg!.pnl[sourceName]!.withdrawal += actual;
          monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + actual;
          monthlyGrossIncome += actual;
          remaining -= actual;
        }
      }
    } else {
      // NET mode
      const guarNetMo = guarGrossMo - (annualTaxOnGuar / 12);
      let remainingNet = Math.max(0, monthlyTarget - guarNetMo);

      for (const sourceName of priority) {
        if (remainingNet <= 0.01) break;
        if (sourceName in dcBalances && dcBalances[sourceName]! > 0.01) {
          let grossNeeded = remainingNet * dcGrossPerNet;
          grossNeeded = Math.min(grossNeeded, dcBalances[sourceName]!);
          if (grossNeeded > 0.01) {
            dcBalances[sourceName] = dcBalances[sourceName]! - grossNeeded;
            if (dcBalances[sourceName]! < 0.01) dcBalances[sourceName] = 0;
            const tfp = dcMeta[sourceName]!.tax_free_portion;
            const tfpAmt = grossNeeded * tfp;
            currentAgg!.dc_gross += grossNeeded;
            currentAgg!.dc_tf += tfpAmt;
            const netFromThis = grossNeeded / dcGrossPerNet;
            currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + netFromThis;
            currentAgg!.pnl[sourceName]!.withdrawal += grossNeeded;
            monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + netFromThis;
            monthlyGrossIncome += grossNeeded;
            remainingNet = Math.max(0, remainingNet - netFromThis);
          }
        } else if (sourceName in tfBalances && tfBalances[sourceName]! > 0.01) {
          const available = tfBalances[sourceName]!;
          const actual = Math.min(remainingNet, available);
          if (actual > 0.01) {
            tfBalances[sourceName] = tfBalances[sourceName]! - actual;
            if (tfBalances[sourceName]! < 0.01) tfBalances[sourceName] = 0;
            currentAgg!.tf_total += actual;
            currentAgg!.withdrawal_detail[sourceName] = (currentAgg!.withdrawal_detail[sourceName] ?? 0) + actual;
            currentAgg!.pnl[sourceName]!.withdrawal += actual;
            monthlyWithdrawalDetail[sourceName] = (monthlyWithdrawalDetail[sourceName] ?? 0) + actual;
            monthlyGrossIncome += actual;
            remainingNet -= actual;
          }
        }
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

    // ---- Early exit for extended chart projection ---- //
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

    // ---- Step 5: Monthly CPI on target ---- //
    if (useMonthlyFromCpi) {
      monthlyTarget *= (1 + monthlyCpi);
    }
    currentAgg!.months_counted++;

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
  }

  // ---- Finalise last year ---- //
  if (currentAgg !== null && currentAgg.months_counted > 0) {
    const totalTaxableFinal = currentAgg.guaranteed_taxable
      + (currentAgg.dc_gross - currentAgg.dc_tf);
    const finalTax = calculateTax(totalTaxableFinal, taxCfg);
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

  const result: ProjectionResult = { years, summary, warnings };
  if (monthlyRows !== null) {
    result.monthly_rows = monthlyRows;
  }
  return result;
}
