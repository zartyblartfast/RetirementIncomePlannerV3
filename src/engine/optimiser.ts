/**
 * Optimiser Engine — Drawdown order permutation analysis,
 * max sustainable income search, and max plan duration search.
 *
 * All functions accept an optional backtestWindowStart to run
 * against historical data instead of static growth rates.
 */

import type { PlannerConfig, ProjectionResult } from './types';
import { runProjection } from './projection';
import { runProjectionForWindow, getKeyWindowStarts } from './backtest';
import type { KeyWindowStarts } from './backtest';
import { normalizeConfig } from './strategies';

// ------------------------------------------------------------------ //
//  Types
// ------------------------------------------------------------------ //

export interface OrderMetrics {
  order: string[];
  label: string;
  sustainable: boolean;
  remaining_capital: number;
  total_tax: number;
  total_income: number;
  first_shortfall_age: number | null;
  depletion_age: number | null;
}

export interface DrawdownOrderResult {
  permutations: OrderMetrics[];
  currentOrder: string[];
  currentLabel: string;
}

export interface MaxIncomeResult {
  max_income: number;
  current_income: number;
  headroom: number;
  headroom_pct: number;
  portfolio_driven: boolean;
}

export interface MaxAgeResult {
  max_age: number;
  current_end_age: number;
  extra_years: number;
}

export interface IncomeSweepPoint {
  income: number;
  sustainable: boolean;
  remaining_capital: number;
  total_tax: number;
  first_shortfall_age: number | null;
  is_current: boolean;
}

export interface RetirementAgeSweepPoint {
  retirement_age: number;
  sustainable: boolean;
  remaining_capital: number;
  total_income: number;
  annual_income: number;
  total_tax: number;
  first_shortfall_age: number | null;
  depletion_age: number | null;
  is_current: boolean;
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

/** Run projection with optional historical window. */
function runProj(cfg: PlannerConfig, windowStart?: number): ProjectionResult {
  if (windowStart !== undefined) {
    return runProjectionForWindow(cfg, windowStart);
  }
  return runProjection(cfg);
}

/** Deep clone a config. */
function clone(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg));
}

/** Generate all permutations of an array. */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i]!, ...perm]);
    }
  }
  return result;
}

/** Get all drawable source names from config. */
function getDrawableSources(cfg: PlannerConfig): string[] {
  const sources: string[] = [];
  for (const pot of cfg.dc_pots) sources.push(pot.name);
  for (const acc of cfg.tax_free_accounts) sources.push(acc.name);
  return sources;
}

/** Extract metrics from a projection result. */
function extractMetrics(
  result: ProjectionResult,
  order: string[],
): OrderMetrics {
  const s = result.summary;
  const totalIncome = result.years.reduce((sum, yr) => sum + yr.net_income_achieved, 0);

  // Find first pot depletion age
  let depletionAge: number | null = null;
  for (const yr of result.years) {
    if (yr.total_capital < 1) {
      depletionAge = yr.age;
      break;
    }
  }

  return {
    order,
    label: order.join(' → '),
    sustainable: s.sustainable,
    remaining_capital: Math.round(s.remaining_capital),
    total_tax: Math.round(s.total_tax_paid),
    total_income: Math.round(totalIncome),
    first_shortfall_age: s.first_shortfall_age,
    depletion_age: depletionAge,
  };
}

// Strategies where income is derived from portfolio, not user-set
const PORTFOLIO_DRIVEN = new Set(['arva', 'arva_guardrails', 'fixed_percentage']);

/** Set income target in both target_income and strategy params. */
function setIncomeTarget(cfg: PlannerConfig, income: number): void {
  cfg.target_income.net_annual = income;
  const sid = cfg.drawdown_strategy ?? 'fixed_target';
  const params = cfg.drawdown_strategy_params ?? {};
  if (sid === 'fixed_target') {
    params.net_annual = income;
  } else if (sid === 'vanguard_dynamic' || sid === 'guyton_klinger') {
    params.initial_target = income;
  }
  cfg.drawdown_strategy_params = params;
}

// ------------------------------------------------------------------ //
//  Re-export key windows for UI
// ------------------------------------------------------------------ //
export { getKeyWindowStarts };
export type { KeyWindowStarts };

// ------------------------------------------------------------------ //
//  1. Drawdown Order Analysis
// ------------------------------------------------------------------ //

export function analyseDrawdownOrders(
  baseCfg: PlannerConfig,
  windowStart?: number,
): DrawdownOrderResult {
  const sources = getDrawableSources(baseCfg);
  const currentOrder = baseCfg.withdrawal_priority.length > 0
    ? baseCfg.withdrawal_priority
    : sources;

  const perms = permutations(sources);
  const results: OrderMetrics[] = [];

  for (const perm of perms) {
    const cfg = clone(baseCfg);
    cfg.withdrawal_priority = perm;
    normalizeConfig(cfg);
    const result = runProj(cfg, windowStart);
    results.push(extractMetrics(result, perm));
  }

  return {
    permutations: results,
    currentOrder,
    currentLabel: currentOrder.join(' → '),
  };
}

// ------------------------------------------------------------------ //
//  2. Max Sustainable Income (binary search)
// ------------------------------------------------------------------ //

export function findMaxSustainableIncome(
  baseCfg: PlannerConfig,
  windowStart?: number,
): MaxIncomeResult {
  const currentIncome = baseCfg.target_income.net_annual;
  const sid = baseCfg.drawdown_strategy ?? 'fixed_target';

  if (PORTFOLIO_DRIVEN.has(sid)) {
    return {
      max_income: currentIncome,
      current_income: currentIncome,
      headroom: 0,
      headroom_pct: 0,
      portfolio_driven: true,
    };
  }

  function isSustainable(income: number): boolean {
    const cfg = clone(baseCfg);
    setIncomeTarget(cfg, income);
    normalizeConfig(cfg);
    const result = runProj(cfg, windowStart);
    return result.summary.sustainable;
  }

  // Find upper bound
  let lo = 0;
  let hi = currentIncome * 3;
  while (isSustainable(hi) && hi < currentIncome * 20) {
    hi *= 1.5;
  }

  // Binary search (tolerance £100)
  for (let i = 0; i < 50; i++) {
    if (hi - lo < 100) break;
    const mid = (lo + hi) / 2;
    if (isSustainable(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const maxIncome = Math.round(lo);
  const headroom = maxIncome - currentIncome;

  return {
    max_income: maxIncome,
    current_income: currentIncome,
    headroom: Math.round(headroom),
    headroom_pct: currentIncome > 0 ? Math.round(headroom / currentIncome * 1000) / 10 : 0,
    portfolio_driven: false,
  };
}

// ------------------------------------------------------------------ //
//  3. Max Sustainable Age (linear search)
// ------------------------------------------------------------------ //

export function findMaxSustainableAge(
  baseCfg: PlannerConfig,
  windowStart?: number,
): MaxAgeResult {
  const currentEndAge = baseCfg.personal.end_age;
  const retirementAge = baseCfg.personal.retirement_age ??
    Math.floor(
      (parseInt(baseCfg.personal.retirement_date.split('-')[0]!) * 12 +
        parseInt(baseCfg.personal.retirement_date.split('-')[1]!) -
        parseInt(baseCfg.personal.date_of_birth.split('-')[0]!) * 12 -
        parseInt(baseCfg.personal.date_of_birth.split('-')[1]!)) / 12,
    );

  // Check current sustainability
  const currentResult = runProj(clone(baseCfg), windowStart);

  if (!currentResult.summary.sustainable) {
    // Search downward
    for (let age = currentEndAge - 1; age > retirementAge; age--) {
      const cfg = clone(baseCfg);
      cfg.personal.end_age = age;
      normalizeConfig(cfg);
      const result = runProj(cfg, windowStart);
      if (result.summary.sustainable) {
        return {
          max_age: age,
          current_end_age: currentEndAge,
          extra_years: age - currentEndAge,
        };
      }
    }
    return {
      max_age: retirementAge,
      current_end_age: currentEndAge,
      extra_years: retirementAge - currentEndAge,
    };
  }

  // Search upward
  let maxAge = currentEndAge;
  for (let age = currentEndAge + 1; age <= 120; age++) {
    const cfg = clone(baseCfg);
    cfg.personal.end_age = age;
    normalizeConfig(cfg);
    const result = runProj(cfg, windowStart);
    if (result.summary.sustainable) {
      maxAge = age;
    } else {
      break;
    }
  }

  return {
    max_age: maxAge,
    current_end_age: currentEndAge,
    extra_years: maxAge - currentEndAge,
  };
}

// ------------------------------------------------------------------ //
//  4. Income Sweep (frontier chart data)
// ------------------------------------------------------------------ //

export function incomeSweep(
  baseCfg: PlannerConfig,
  maxSustainableIncome: number,
  windowStart?: number,
): IncomeSweepPoint[] {
  const currentIncome = baseCfg.target_income.net_annual;
  const sid = baseCfg.drawdown_strategy ?? 'fixed_target';

  if (PORTFOLIO_DRIVEN.has(sid)) return [];

  const lo = Math.max(1000, Math.round(currentIncome * 0.67 / 1000) * 1000);
  const hi = Math.round(
    Math.min(currentIncome * 1.33, Math.max(maxSustainableIncome, currentIncome * 1.1)) / 1000,
  ) * 1000 || lo + 5000;

  const step = (hi - lo) <= 20000 ? 1000 : 2000;
  const incomes: number[] = [];
  for (let inc = lo; inc <= hi; inc += step) incomes.push(inc);

  // Ensure current income is included
  const roundedCurrent = Math.round(currentIncome / 1000) * 1000;
  if (!incomes.includes(roundedCurrent)) {
    incomes.push(roundedCurrent);
    incomes.sort((a, b) => a - b);
  }

  return incomes.map(income => {
    const cfg = clone(baseCfg);
    setIncomeTarget(cfg, income);
    normalizeConfig(cfg);
    const result = runProj(cfg, windowStart);
    const s = result.summary;
    return {
      income,
      sustainable: s.sustainable,
      remaining_capital: Math.round(s.remaining_capital),
      total_tax: Math.round(s.total_tax_paid),
      first_shortfall_age: s.first_shortfall_age,
      is_current: income === roundedCurrent,
    };
  });
}

// ------------------------------------------------------------------ //
//  5. Retirement Age Sensitivity
// ------------------------------------------------------------------ //

export function retirementAgeSweep(
  baseCfg: PlannerConfig,
  windowStart?: number,
  minAge = 58,
  maxAge = 75,
): RetirementAgeSweepPoint[] {
  const currentRetAge = baseCfg.personal.retirement_age ??
    Math.floor(
      (parseInt(baseCfg.personal.retirement_date.split('-')[0]!) * 12 +
        parseInt(baseCfg.personal.retirement_date.split('-')[1]!) -
        parseInt(baseCfg.personal.date_of_birth.split('-')[0]!) * 12 -
        parseInt(baseCfg.personal.date_of_birth.split('-')[1]!)) / 12,
    );

  const points: RetirementAgeSweepPoint[] = [];

  for (let age = minAge; age <= maxAge; age++) {
    const cfg = clone(baseCfg);

    // Adjust retirement_date based on age offset from current
    const [dobY, dobM] = baseCfg.personal.date_of_birth.split('-').map(Number) as [number, number];
    const retMonth = dobM;
    const retYear = dobY + age;
    cfg.personal.retirement_date = `${retYear}-${String(retMonth).padStart(2, '0')}`;
    if (cfg.personal.retirement_age !== undefined) {
      cfg.personal.retirement_age = age;
    }

    // When using a historical window, shift windowStart so the same calendar
    // age always maps to the same historical year.  buildSchedules maps
    // retirementAge+offset → windowStartYear+offset, so changing retirement
    // age shifts which historical years each age sees.  Compensate:
    //   adjustedStart = windowStart + (age - currentRetAge)
    const adjustedWindow = windowStart !== undefined
      ? windowStart + (age - currentRetAge)
      : undefined;

    normalizeConfig(cfg);
    const result = runProj(cfg, adjustedWindow);
    const s = result.summary;
    const totalIncome = result.years.reduce((sum, yr) => sum + yr.net_income_achieved, 0);
    const nYears = result.years.length;
    let deplAge: number | null = null;
    for (const yr of result.years) {
      if (yr.total_capital < 1) { deplAge = yr.age; break; }
    }

    points.push({
      retirement_age: age,
      sustainable: s.sustainable,
      remaining_capital: Math.round(s.remaining_capital),
      total_income: Math.round(totalIncome),
      annual_income: nYears > 0 ? Math.round(totalIncome / nYears) : 0,
      total_tax: Math.round(s.total_tax_paid),
      first_shortfall_age: s.first_shortfall_age,
      depletion_age: deplAge,
      is_current: age === currentRetAge,
    });
  }

  return points;
}
