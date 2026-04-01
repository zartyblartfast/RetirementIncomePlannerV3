/**
 * Backtest Engine — Rolling-window historical backtesting wrapper.
 *
 * Runs the projection engine across multiple historical periods,
 * injecting year-varying growth rates and CPI from historical_returns.json.
 *
 * Each pot's annual return is computed as a weighted blend of historical
 * asset-class returns, based on the pot's holdings → benchmark_key → asset class
 * mapping chain.
 *
 * Port of V1 backtest_engine.py
 */

import type { PlannerConfig } from './types';
import { runProjection } from './projection';

// ------------------------------------------------------------------ //
//  Types for data files
// ------------------------------------------------------------------ //

interface HistoricalReturns {
  metadata: Record<string, unknown>;
  annual_returns: Record<string, Record<string, number>>;
}

interface HistDataMappingSingle {
  method: 'single';
  series: string;
  fallback?: string | null;
}

interface HistDataMappingBlend {
  method: 'blend';
  components: Array<{ series: string; weight: number }>;
  fallback?: string | null;
}

interface HistDataMappingDerived {
  method: 'derived';
  formula: string;
  fallback?: string | null;
}

type HistDataMapping = HistDataMappingSingle | HistDataMappingBlend | HistDataMappingDerived;

interface PortfolioTemplate {
  id: string;
  label: string;
  weights: Array<{ asset_class_id: string; weight: number }>;
}

interface AssetModel {
  benchmark_mappings: Record<string, string>;
  historical_data_mapping: Record<string, HistDataMapping>;
  portfolio_templates: PortfolioTemplate[];
  [key: string]: unknown;
}

// ------------------------------------------------------------------ //
//  Data loading — static imports for bundling
// ------------------------------------------------------------------ //

import historicalReturnsJson from './data/historical_returns.json';
import assetModelJson from './data/asset_model.json';

const historicalReturns: HistoricalReturns = historicalReturnsJson as HistoricalReturns;
const assetModel: AssetModel = assetModelJson as AssetModel;

// ------------------------------------------------------------------ //
//  Asset-class return resolver
// ------------------------------------------------------------------ //

function resolveAssetClassReturn(
  assetClassId: string,
  yearStr: string,
  annualReturns: Record<string, Record<string, number>>,
  histDataMapping: Record<string, HistDataMapping>,
): number | null {
  const entry = annualReturns[yearStr] ?? {};
  const mapping = histDataMapping[assetClassId];
  if (!mapping) return null;

  if (mapping.method === 'single') {
    const val = entry[mapping.series];
    if (val !== undefined) return val;
    if (mapping.fallback) return entry[mapping.fallback] ?? null;
    return null;
  }

  if (mapping.method === 'blend') {
    let total = 0;
    let totalWeight = 0;
    for (const comp of mapping.components) {
      let val: number | null;
      if (comp.series.startsWith('_')) {
        // Recursive reference
        const subId = comp.series.slice(1);
        val = resolveAssetClassReturn(subId, yearStr, annualReturns, histDataMapping);
      } else {
        val = entry[comp.series] ?? null;
      }
      if (val !== null) {
        total += comp.weight * val;
        totalWeight += comp.weight;
      }
    }
    if (totalWeight > 0) {
      const fullWeight = mapping.components.reduce((s, c) => s + c.weight, 0);
      return (total / totalWeight) * fullWeight;
    }
    if (mapping.fallback) return entry[mapping.fallback] ?? null;
    return null;
  }

  if (mapping.method === 'derived') {
    const formula = mapping.formula ?? '';
    if (formula.includes(' - ')) {
      const parts = formula.split(' - ');
      const a = entry[parts[0]!.trim()];
      const b = entry[parts[1]!.trim()];
      if (a !== undefined && b !== undefined) return a - b;
    }
    return null;
  }

  return null;
}

// ------------------------------------------------------------------ //
//  Per-pot annual return from holdings
// ------------------------------------------------------------------ //

interface PotLikeConfig {
  holdings?: Array<{ benchmark_key: string; weight: number }>;
  allocation?: { mode: string; template_id?: string; custom_weights?: Record<string, number> };
  growth_rate?: number;
}

function computePotAnnualReturn(
  potConfig: PotLikeConfig,
  yearStr: string,
  annualReturns: Record<string, Record<string, number>>,
  am: AssetModel,
  hdm: Record<string, HistDataMapping>,
): number | null {
  const benchmarkMappings = am.benchmark_mappings ?? {};
  const holdings = potConfig.holdings ?? [];

  if (holdings.length > 0) {
    let totalReturn = 0;
    let totalWeight = 0;
    for (const h of holdings) {
      const bk = h.benchmark_key ?? '';
      const w = h.weight ?? 0;
      const assetClass = benchmarkMappings[bk];
      if (assetClass && w > 0) {
        const acReturn = resolveAssetClassReturn(assetClass, yearStr, annualReturns, hdm);
        if (acReturn !== null) {
          totalReturn += w * acReturn;
          totalWeight += w;
        }
      }
    }
    if (totalWeight > 0) return totalReturn / totalWeight;
    return null;
  }

  // Fallback: allocation template
  const alloc = potConfig.allocation;
  if (!alloc) return null;

  if (alloc.mode === 'template' && alloc.template_id) {
    const templates: Record<string, PortfolioTemplate> = {};
    for (const t of am.portfolio_templates ?? []) {
      templates[t.id] = t;
    }
    const template = templates[alloc.template_id];
    if (template) {
      let totalReturn = 0;
      let totalWeight = 0;
      for (const tw of template.weights) {
        const acReturn = resolveAssetClassReturn(tw.asset_class_id, yearStr, annualReturns, hdm);
        if (acReturn !== null) {
          totalReturn += tw.weight * acReturn;
          totalWeight += tw.weight;
        }
      }
      if (totalWeight > 0) return totalReturn / totalWeight;
    }
  }

  if (alloc.mode === 'custom' && alloc.custom_weights) {
    let totalReturn = 0;
    let totalWeight = 0;
    for (const [acId, w] of Object.entries(alloc.custom_weights)) {
      const acReturn = resolveAssetClassReturn(acId, yearStr, annualReturns, hdm);
      if (acReturn !== null) {
        totalReturn += w * acReturn;
        totalWeight += w;
      }
    }
    if (totalWeight > 0) return totalReturn / totalWeight;
  }

  return null;
}

// ------------------------------------------------------------------ //
//  Build growth & CPI schedules for one historical window
// ------------------------------------------------------------------ //

interface Schedules {
  _dc_growth_schedules: Record<string, Record<number, number>>;
  _tf_growth_schedules: Record<string, Record<number, number>>;
  cpi_rate_schedule: Record<number, number>;
  window_label: string;
  window_start: number;
}

function buildSchedules(
  cfg: PlannerConfig,
  windowStartYear: number,
  nYears: number,
  annualReturns: Record<string, Record<string, number>>,
  am: AssetModel,
  hdm: Record<string, HistDataMapping>,
): Schedules {
  const dobStr = cfg.personal.date_of_birth;
  const retStr = cfg.personal.retirement_date;
  const [dobY, dobM] = parseYm(dobStr);
  const [retY, retM] = parseYm(retStr);
  const retirementAge = Math.floor(((retY * 12 + retM - 1) - (dobY * 12 + dobM - 1)) / 12);

  const dcSchedules: Record<string, Record<number, number>> = {};
  for (const pot of cfg.dc_pots) {
    dcSchedules[pot.name] = {};
  }

  const tfSchedules: Record<string, Record<number, number>> = {};
  for (const acc of cfg.tax_free_accounts) {
    tfSchedules[acc.name] = {};
  }

  const cpiSchedule: Record<number, number> = {};

  for (let offset = 0; offset < nYears; offset++) {
    const age = retirementAge + offset;
    const histYear = windowStartYear + offset;
    const yearStr = String(histYear);

    // CPI
    const entry = annualReturns[yearStr] ?? {};
    const ukCpi = entry.uk_cpi;
    if (ukCpi !== undefined) {
      cpiSchedule[age] = ukCpi;
    }

    // DC pots
    for (const pot of cfg.dc_pots) {
      const ret = computePotAnnualReturn(pot, yearStr, annualReturns, am, hdm);
      if (ret !== null) {
        dcSchedules[pot.name]![age] = ret;
      }
    }

    // Tax-free accounts
    for (const acc of cfg.tax_free_accounts) {
      const ret = computePotAnnualReturn(acc, yearStr, annualReturns, am, hdm);
      if (ret !== null) {
        tfSchedules[acc.name]![age] = ret;
      }
    }
  }

  const endYear = windowStartYear + nYears - 1;
  return {
    _dc_growth_schedules: dcSchedules,
    _tf_growth_schedules: tfSchedules,
    cpi_rate_schedule: cpiSchedule,
    window_label: `${windowStartYear}-${endYear}`,
    window_start: windowStartYear,
  };
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function parseYm(s: string): [number, number] {
  const parts = s.split('-');
  return [parseInt(parts[0]!, 10), parseInt(parts[1]!, 10)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------------ //
//  Main backtest runner
// ------------------------------------------------------------------ //

export interface BacktestWindow {
  window_label: string;
  window_start: number;
  result: ReturnType<typeof runProjection>;
}

export interface BacktestResult {
  windows: BacktestWindow[];
  metadata: {
    n_windows: number;
    n_years: number;
    start_range: number | null;
    end_range: number | null;
    retirement_age: number;
    end_age: number;
  };
}

export function runBacktest(
  cfg: PlannerConfig,
  maxWindows?: number,
): BacktestResult {
  const annualReturns = historicalReturns.annual_returns;
  const hdm = assetModel.historical_data_mapping as Record<string, HistDataMapping>;

  const [dobY, dobM] = parseYm(cfg.personal.date_of_birth);
  const [retY, retM] = parseYm(cfg.personal.retirement_date);
  const retirementAge = Math.floor(((retY * 12 + retM - 1) - (dobY * 12 + dobM - 1)) / 12);
  const endAge = cfg.personal.end_age;
  const nYears = endAge - retirementAge;

  // Determine viable window range
  const availableYears = Object.keys(annualReturns).map(Number).sort((a, b) => a - b);
  const maxYear = availableYears[availableYears.length - 1]!;

  let viableStarts = availableYears.filter(y => y + nYears - 1 <= maxYear);
  if (maxWindows !== undefined) {
    viableStarts = viableStarts.slice(0, maxWindows);
  }

  const windows: BacktestWindow[] = [];
  for (const startYear of viableStarts) {
    const windowCfg: PlannerConfig = JSON.parse(JSON.stringify(cfg));

    const schedules = buildSchedules(windowCfg, startYear, nYears, annualReturns, assetModel, hdm);

    windowCfg._dc_growth_schedules = schedules._dc_growth_schedules;
    windowCfg._tf_growth_schedules = schedules._tf_growth_schedules;
    windowCfg.cpi_rate_schedule = schedules.cpi_rate_schedule;

    const result = runProjection(windowCfg);

    windows.push({
      window_label: schedules.window_label,
      window_start: startYear,
      result,
    });
  }

  return {
    windows,
    metadata: {
      n_windows: windows.length,
      n_years: nYears,
      start_range: viableStarts[0] ?? null,
      end_range: viableStarts[viableStarts.length - 1] ?? null,
      retirement_age: retirementAge,
      end_age: endAge,
    },
  };
}

// ------------------------------------------------------------------ //
//  Stress-test analysis: percentiles + income stability + timeline
// ------------------------------------------------------------------ //

export interface PercentilePoint {
  age: number;
  total_capital: number;
  net_income: number;
}

export interface StressTestResult {
  ages: number[];
  percentile_trajectories: Record<string, PercentilePoint[]>;
  sustainability: {
    rate: number;
    count: number;
    total: number;
    depletion_age_dist: Array<{ age: number; count: number }>;
  };
  income_stability: {
    median_income_ratio: number;
    worst_income_ratio: number;
    best_income_ratio: number;
    target_income_used: number;
  };
  cumulative_income: {
    median: number;
    worst: number;
    best: number;
  };
  n_windows: number;
  worst_window: WindowSummary;
  median_window: WindowSummary;
  best_window: WindowSummary;
}

interface TimelineEntry {
  age: number;
  calendar_year: number;
  market_return: number | null;
  total_capital: number;
  net_income: number;
  target_income: number;
  income_ratio: number;
  shortfall: boolean;
}

interface WindowSummary {
  label: string;
  start_year: number;
  final_capital: number;
  depletion_age?: number | null;
  timeline: TimelineEntry[];
  trajectory?: number[];
}

/**
 * Compute the p-th percentile of a sorted-ascending array.
 * Uses linear interpolation (same as numpy's default).
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

export function extractStressTest(
  backtestResult: BacktestResult,
  targetIncome?: number,
  percentiles: number[] = [5, 10, 25, 50, 75, 90],
): StressTestResult | null {
  const { windows, metadata } = backtestResult;
  if (windows.length === 0) return null;

  const retirementAge = metadata.retirement_age;
  const endAge = metadata.end_age;
  const ages: number[] = [];
  for (let a = retirementAge; a <= endAge; a++) ages.push(a);

  const hdm = assetModel.historical_data_mapping as Record<string, HistDataMapping>;
  const annualReturns = historicalReturns.annual_returns;

  // Collect per-age arrays
  const capitalByAge: Record<number, number[]> = {};
  const incomeByAge: Record<number, number[]> = {};
  const targetByAge: Record<number, number[]> = {};
  for (const age of ages) {
    capitalByAge[age] = [];
    incomeByAge[age] = [];
    targetByAge[age] = [];
  }

  for (const w of windows) {
    const yearLookup: Record<number, (typeof w.result.years)[0]> = {};
    for (const yr of w.result.years) {
      yearLookup[yr.age] = yr;
    }
    for (const age of ages) {
      const yr = yearLookup[age];
      if (yr) {
        capitalByAge[age]!.push(yr.total_capital);
        incomeByAge[age]!.push(yr.net_income_achieved);
        targetByAge[age]!.push(yr.target_net);
      } else {
        capitalByAge[age]!.push(0);
        incomeByAge[age]!.push(0);
        targetByAge[age]!.push(0);
      }
    }
  }

  // Percentile trajectories
  const pctTrajectories: Record<string, PercentilePoint[]> = {};
  for (const p of percentiles) {
    const label = `p${p}`;
    pctTrajectories[label] = [];
    for (const age of ages) {
      const sortedCap = [...capitalByAge[age]!].sort((a, b) => a - b);
      const sortedInc = [...incomeByAge[age]!].sort((a, b) => a - b);
      pctTrajectories[label]!.push({
        age,
        total_capital: round2(percentile(sortedCap, p)),
        net_income: round2(percentile(sortedInc, p)),
      });
    }
  }

  // Sustainability rate
  const DEPLETION_EPSILON = 1.0;
  const sustainableCount = capitalByAge[endAge]!.filter(v => v > DEPLETION_EPSILON).length;
  const sustainabilityRate = windows.length > 0 ? sustainableCount / windows.length : 0;

  // Depletion age distribution
  const depletionAges: Record<number, number> = {};
  for (const w of windows) {
    let deplAge: number | null = null;
    for (const yr of w.result.years) {
      if (yr.total_capital <= DEPLETION_EPSILON) {
        deplAge = yr.age;
        break;
      }
    }
    if (deplAge !== null) {
      depletionAges[deplAge] = (depletionAges[deplAge] ?? 0) + 1;
    }
  }
  const depletionAgeDist = Object.entries(depletionAges)
    .map(([a, c]) => ({ age: Number(a), count: c }))
    .sort((a, b) => a.age - b.age);

  // Income stability
  let effectiveTargetIncome = targetIncome ?? null;
  if (effectiveTargetIncome === null && windows[0]!.result.years.length > 0) {
    effectiveTargetIncome = windows[0]!.result.years[0]!.target_net;
  }

  const allIncomeRatios: number[] = [];
  const windowCumulIncomes: number[] = [];
  for (const w of windows) {
    let cumul = 0;
    for (const yr of w.result.years) {
      const inc = yr.net_income_achieved;
      const tgt = yr.target_net;
      cumul += inc;
      if (tgt > 0) allIncomeRatios.push(inc / tgt);
    }
    windowCumulIncomes.push(cumul);
  }

  const medianIncomeRatio = allIncomeRatios.length > 0 ? median(allIncomeRatios) : 1;
  const worstIncomeRatio = allIncomeRatios.length > 0 ? Math.min(...allIncomeRatios) : 1;
  const bestIncomeRatio = allIncomeRatios.length > 0 ? Math.max(...allIncomeRatios) : 1;

  const medianCumulIncome = windowCumulIncomes.length > 0 ? median(windowCumulIncomes) : 0;
  const worstCumulIncome = windowCumulIncomes.length > 0 ? Math.min(...windowCumulIncomes) : 0;
  const bestCumulIncome = windowCumulIncomes.length > 0 ? Math.max(...windowCumulIncomes) : 0;

  // Worst / best / median window identification
  const finals = capitalByAge[endAge]!;

  let worstIdx = 0;
  let bestIdx = 0;
  for (let i = 1; i < finals.length; i++) {
    if (finals[i]! < finals[worstIdx]!) worstIdx = i;
    if (finals[i]! > finals[bestIdx]!) bestIdx = i;
  }

  const sortedFinals = [...finals].sort((a, b) => a - b);
  const medianVal = sortedFinals[Math.floor(sortedFinals.length / 2)]!;
  let medianIdx = 0;
  let minDiff = Math.abs(finals[0]! - medianVal);
  for (let i = 1; i < finals.length; i++) {
    const diff = Math.abs(finals[i]! - medianVal);
    if (diff < minDiff) {
      minDiff = diff;
      medianIdx = i;
    }
  }

  // Build timelines
  function buildTimeline(w: BacktestWindow): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    for (const yr of w.result.years) {
      const histYear = w.window_start + (yr.age - retirementAge);
      const marketReturn = resolveAssetClassReturn(
        'global_equity', String(histYear), annualReturns, hdm);
      const tgt = yr.target_net;
      const inc = yr.net_income_achieved;
      const incRatio = tgt > 0 ? inc / tgt : 1;
      timeline.push({
        age: yr.age,
        calendar_year: histYear,
        market_return: marketReturn !== null ? round2(marketReturn * 100) : null,
        total_capital: Math.round(yr.total_capital),
        net_income: Math.round(inc),
        target_income: Math.round(tgt),
        income_ratio: round2(incRatio),
        shortfall: yr.shortfall,
      });
    }
    return timeline;
  }

  const worstW = windows[worstIdx]!;
  const medianW = windows[medianIdx]!;
  const bestW = windows[bestIdx]!;

  const worstFinal = finals[worstIdx]!;
  let worstDepl: number | null = null;
  for (const age of ages) {
    if (capitalByAge[age]![worstIdx]! <= DEPLETION_EPSILON) {
      worstDepl = age;
      break;
    }
  }

  return {
    ages,
    percentile_trajectories: pctTrajectories,
    sustainability: {
      rate: round2(sustainabilityRate),
      count: sustainableCount,
      total: windows.length,
      depletion_age_dist: depletionAgeDist,
    },
    income_stability: {
      median_income_ratio: round2(medianIncomeRatio),
      worst_income_ratio: round2(worstIncomeRatio),
      best_income_ratio: round2(bestIncomeRatio),
      target_income_used: round2(effectiveTargetIncome ?? 0),
    },
    cumulative_income: {
      median: Math.round(medianCumulIncome),
      worst: Math.round(worstCumulIncome),
      best: Math.round(bestCumulIncome),
    },
    n_windows: windows.length,
    worst_window: {
      label: worstW.window_label,
      start_year: worstW.window_start,
      final_capital: round2(worstFinal),
      depletion_age: worstDepl,
      timeline: buildTimeline(worstW),
      trajectory: ages.map(age => Math.round(capitalByAge[age]![worstIdx]!)),
    },
    median_window: {
      label: medianW.window_label,
      start_year: medianW.window_start,
      final_capital: round2(finals[medianIdx]!),
      timeline: buildTimeline(medianW),
    },
    best_window: {
      label: bestW.window_label,
      start_year: bestW.window_start,
      final_capital: round2(finals[bestIdx]!),
      timeline: buildTimeline(bestW),
    },
  };
}

// Backward compat alias
export function extractPercentiles(
  backtestResult: BacktestResult,
  percentiles: number[] = [10, 25, 50, 75, 90],
): StressTestResult | null {
  return extractStressTest(backtestResult, undefined, percentiles);
}
