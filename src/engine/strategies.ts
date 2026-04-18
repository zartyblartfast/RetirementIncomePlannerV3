/**
 * Drawdown strategy registry and computation functions.
 *
 * Each strategy determines HOW MUCH to withdraw each year.
 * The drawdown ORDER (which pots fund the withdrawal) is handled
 * separately by the engine's priority-based allocation.
 *
 * Port of V1 drawdown_strategies.py
 */

import type {
  StrategyDefinition,
  StrategyTarget,
  StrategyState,
  PlannerConfig,
} from './types';

// ------------------------------------------------------------------ //
//  Strategy registry
// ------------------------------------------------------------------ //

export const STRATEGIES: Record<string, StrategyDefinition> = {
  fixed_target: {
    display_name: 'Fixed Target',
    description: 'Withdraw a fixed net income target each year, adjusted by CPI.',
    params: [
      { key: 'net_annual', label: 'Target Net Income (£)', type: 'number', step: 500, default: 30000 },
    ],
  },
  fixed_percentage: {
    display_name: 'Fixed Percentage',
    description: 'Withdraw a fixed percentage of the investable portfolio each year.',
    portfolio_driven: true,
    params: [
      { key: 'withdrawal_rate', label: 'Withdrawal Rate (%)', type: 'number', step: 0.1, default: 4.0 },
    ],
  },
  vanguard_dynamic: {
    display_name: 'Vanguard Dynamic Spending',
    description: 'CPI-adjusted withdrawals with capped annual increases and decreases.',
    params: [
      { key: 'initial_target', label: 'Initial Target Income (£)', type: 'number', step: 500, default: 30000 },
      { key: 'max_increase_pct', label: 'Max Annual Increase (%)', type: 'number', step: 0.5, default: 5.0,
        tooltip: 'Ceiling: the maximum percentage income can rise in a single year.' },
      { key: 'max_decrease_pct', label: 'Max Annual Decrease (%)', type: 'number', step: 0.5, default: 2.5,
        tooltip: 'Floor: the maximum percentage income can fall in a single year.' },
    ],
  },
  guyton_klinger: {
    display_name: 'Guyton-Klinger Guardrails',
    description: 'Income adjusted when withdrawal rate drifts outside guardrails.',
    params: [
      { key: 'initial_target', label: 'Initial Target Income (£)', type: 'number', step: 500, default: 30000 },
      { key: 'upper_guardrail_pct', label: 'Upper Guardrail (%)', type: 'number', step: 0.5, default: 5.5,
        tooltip: 'If your withdrawal rate exceeds this, income is cut.' },
      { key: 'lower_guardrail_pct', label: 'Lower Guardrail (%)', type: 'number', step: 0.5, default: 3.5,
        tooltip: 'If your withdrawal rate drops below this, income is raised.' },
      { key: 'raise_pct', label: 'Raise (%)', type: 'number', step: 0.5, default: 10.0,
        tooltip: 'When the lower guardrail triggers, income is increased by this percentage.' },
      { key: 'cut_pct', label: 'Cut (%)', type: 'number', step: 0.5, default: 10.0,
        tooltip: 'When the upper guardrail triggers, income is reduced by this percentage.' },
    ],
  },
  arva: {
    display_name: 'ARVA',
    description: 'Annually Recalculated Virtual Annuity — withdrawal recalculated each year to target depletion by end age.',
    portfolio_driven: true,
    params: [
      { key: 'assumed_real_return_pct', label: 'Assumed Real Return (%)', type: 'number', step: 0.5, default: 3.0,
        tooltip: 'The real (after-inflation) return ARVA assumes when calculating withdrawals.' },
    ],
  },
  arva_guardrails: {
    display_name: 'ARVA + Guardrails',
    description: 'ARVA with caps on year-to-year spending changes to reduce volatility.',
    portfolio_driven: true,
    params: [
      { key: 'assumed_real_return_pct', label: 'Assumed Real Return (%)', type: 'number', step: 0.5, default: 3.0,
        tooltip: 'The real (after-inflation) return ARVA assumes when calculating withdrawals.' },
      { key: 'max_annual_increase_pct', label: 'Max Annual Increase (%)', type: 'number', step: 1.0, default: 10.0,
        tooltip: 'Ceiling: the maximum percentage ARVA income can rise year-to-year.' },
      { key: 'max_annual_decrease_pct', label: 'Max Annual Decrease (%)', type: 'number', step: 1.0, default: 10.0,
        tooltip: 'Floor: the maximum percentage ARVA income can fall year-to-year.' },
    ],
  },
};

export const STRATEGY_IDS = Object.keys(STRATEGIES);

export function getStrategyDisplayName(strategyId: string): string {
  return STRATEGIES[strategyId]?.display_name ?? strategyId;
}

// ------------------------------------------------------------------ //
//  PMT helper (annuity payment)
// ------------------------------------------------------------------ //

function pmt(pv: number, r: number, n: number): number {
  if (n <= 0) return pv;
  if (Math.abs(r) < 1e-10) return pv / n;
  return (pv * r) / (1 - Math.pow(1 + r, -n));
}

// ------------------------------------------------------------------ //
//  Strategy compute functions
// ------------------------------------------------------------------ //

type ComputeFn = (
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  cpiRate: number,
  currentAge: number,
  planEndAge: number,
) => [StrategyTarget, StrategyState];

function computeFixedTarget(
  params: Record<string, number>,
  state: StrategyState,
  _portfolioValue: number,
  _cpiRate: number,
  _currentAge: number,
  _planEndAge: number,
): [StrategyTarget, StrategyState] {
  if (state === null) {
    state = { current_target: params.net_annual ?? 30000 };
  }
  return [
    { mode: 'net', annual_amount: (state as Record<string, number>).current_target! },
    state,
  ];
}

function computeFixedPercentage(
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  _cpiRate: number,
  _currentAge: number,
  _planEndAge: number,
): [StrategyTarget, StrategyState] {
  const rate = (params.withdrawal_rate ?? 4.0) / 100;
  const gross = portfolioValue * rate;
  if (state === null) state = {};
  return [{ mode: 'gross', annual_amount: gross }, state];
}

function computeVanguardDynamic(
  params: Record<string, number>,
  state: StrategyState,
  _portfolioValue: number,
  cpiRate: number,
  _currentAge: number,
  _planEndAge: number,
): [StrategyTarget, StrategyState] {
  const maxUp = (params.max_increase_pct ?? 5.0) / 100;
  const maxDown = (params.max_decrease_pct ?? 2.5) / 100;

  if (state === null) {
    const target = params.initial_target ?? 30000;
    state = { prev_target: target };
    return [{ mode: 'net', annual_amount: target }, state];
  }

  const prev = (state as Record<string, number>).prev_target!;
  const inflationAdjusted = prev * (1 + cpiRate);
  const maxUpVal = prev * (1 + maxUp);
  const maxDownVal = prev * (1 - maxDown);
  const newTarget = Math.max(maxDownVal, Math.min(inflationAdjusted, maxUpVal));

  state = { prev_target: newTarget };
  return [{ mode: 'net', annual_amount: newTarget }, state];
}

function computeGuytonKlinger(
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  cpiRate: number,
  _currentAge: number,
  _planEndAge: number,
): [StrategyTarget, StrategyState] {
  const upper = (params.upper_guardrail_pct ?? 5.5) / 100;
  const lower = (params.lower_guardrail_pct ?? 3.5) / 100;
  const raisePct = (params.raise_pct ?? 10.0) / 100;
  const cutPct = (params.cut_pct ?? 10.0) / 100;

  if (state === null) {
    const target = params.initial_target ?? 30000;
    state = { current_target: target, starting_rate: null as unknown as number, prev_gross: null as unknown as number };
    return [{ mode: 'net', annual_amount: target }, state];
  }

  const s = state as Record<string, unknown>;
  let currentTarget = (s.current_target as number) * (1 + cpiRate);

  const startingRate = s.starting_rate as number | null;
  const prevGross = s.prev_gross as number | null;

  if (startingRate !== null && prevGross !== null && portfolioValue > 0) {
    const currentRate = prevGross / portfolioValue;
    if (currentRate > upper) {
      currentTarget *= (1 - cutPct);
    } else if (currentRate < lower) {
      currentTarget *= (1 + raisePct);
    }
  }

  const newState = { ...s, current_target: currentTarget };
  return [{ mode: 'net', annual_amount: currentTarget }, newState];
}

function computeArva(
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  _cpiRate: number,
  currentAge: number,
  planEndAge: number,
): [StrategyTarget, StrategyState] {
  const r = (params.assumed_real_return_pct ?? 3.0) / 100;

  if (state === null) state = {};

  // +1 so ARVA plans income THROUGH planEndAge (inclusive)
  const remainingYears = Math.max(1, planEndAge - currentAge + 1);
  const remainingMonths = remainingYears * 12;
  const monthlyR = Math.pow(1 + r, 1 / 12) - 1;
  const monthlyPmt = pmt(portfolioValue, monthlyR, remainingMonths);
  const withdrawal = Math.max(0, monthlyPmt * 12);

  state = { prev_withdrawal: withdrawal };
  return [{ mode: 'pot_net', annual_amount: withdrawal }, state];
}

function computeArvaGuardrails(
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  _cpiRate: number,
  currentAge: number,
  planEndAge: number,
): [StrategyTarget, StrategyState] {
  const r = (params.assumed_real_return_pct ?? 3.0) / 100;
  const maxUp = (params.max_annual_increase_pct ?? 10.0) / 100;
  const maxDown = (params.max_annual_decrease_pct ?? 10.0) / 100;

  // +1 so ARVA plans income THROUGH planEndAge (inclusive)
  const remainingYears = Math.max(1, planEndAge - currentAge + 1);
  const remainingMonths = remainingYears * 12;
  const monthlyR = Math.pow(1 + r, 1 / 12) - 1;
  const monthlyPmt = pmt(portfolioValue, monthlyR, remainingMonths);
  const rawWithdrawal = Math.max(0, monthlyPmt * 12);

  if (state === null) {
    state = { prev_withdrawal: rawWithdrawal };
    return [{ mode: 'pot_net', annual_amount: rawWithdrawal }, state];
  }

  const prev = (state as Record<string, number>).prev_withdrawal ?? rawWithdrawal;
  const maxVal = prev * (1 + maxUp);
  const minVal = prev * (1 - maxDown);
  const clamped = Math.max(minVal, Math.min(rawWithdrawal, maxVal));

  state = { prev_withdrawal: clamped };
  return [{ mode: 'pot_net', annual_amount: clamped }, state];
}

// ------------------------------------------------------------------ //
//  Dispatch
// ------------------------------------------------------------------ //

const COMPUTE_MAP: Record<string, ComputeFn> = {
  fixed_target: computeFixedTarget,
  fixed_percentage: computeFixedPercentage,
  vanguard_dynamic: computeVanguardDynamic,
  guyton_klinger: computeGuytonKlinger,
  arva: computeArva,
  arva_guardrails: computeArvaGuardrails,
};

export function computeAnnualTarget(
  strategyId: string,
  params: Record<string, number>,
  state: StrategyState,
  portfolioValue: number,
  cpiRate: number,
  currentAge: number,
  planEndAge: number,
): [StrategyTarget, StrategyState] {
  const fn = COMPUTE_MAP[strategyId] ?? COMPUTE_MAP.fixed_target!;
  return fn(params, state, portfolioValue, cpiRate, currentAge, planEndAge);
}

// ------------------------------------------------------------------ //
//  Config normalization
// ------------------------------------------------------------------ //

export function normalizeConfig(cfg: PlannerConfig): PlannerConfig {
  if (!cfg.drawdown_strategy) {
    cfg.drawdown_strategy = 'fixed_target';
  }

  const fallbackTarget = cfg.target_income?.net_annual ?? 30000;
  const sid = cfg.drawdown_strategy;

  if (!cfg.drawdown_strategy_params) {
    if (sid === 'fixed_target') {
      cfg.drawdown_strategy_params = { net_annual: fallbackTarget };
    } else if (sid === 'vanguard_dynamic' || sid === 'guyton_klinger') {
      const entry = STRATEGIES[sid];
      const params: Record<string, number> = {};
      if (entry) {
        for (const p of entry.params) {
          params[p.key] = p.default;
        }
      }
      params.initial_target = fallbackTarget;
      cfg.drawdown_strategy_params = params;
    } else if (sid === 'arva' || sid === 'arva_guardrails') {
      const entry = STRATEGIES[sid];
      const params: Record<string, number> = {};
      if (entry) {
        for (const p of entry.params) {
          params[p.key] = p.default;
        }
      }
      cfg.drawdown_strategy_params = params;
    } else {
      const entry = STRATEGIES[sid];
      const params: Record<string, number> = {};
      if (entry) {
        for (const p of entry.params) {
          params[p.key] = p.default;
        }
      }
      cfg.drawdown_strategy_params = params;
    }
  }

  // Sync target_income.net_annual from strategy params
  const params = cfg.drawdown_strategy_params!;
  if (sid === 'fixed_target') {
    cfg.target_income.net_annual = params.net_annual ?? fallbackTarget;
  } else if (sid === 'vanguard_dynamic' || sid === 'guyton_klinger') {
    cfg.target_income.net_annual = params.initial_target ?? fallbackTarget;
  }

  // Migrate guaranteed income from start_age/end_age to start_date/end_date
  const dobStr = cfg.personal?.date_of_birth ?? '1960-01';
  const [dobY, dobM] = parseYm(dobStr);

  for (const g of cfg.guaranteed_income ?? []) {
    if (!g.start_date && g.start_age != null) {
      const totalM = dobY * 12 + (dobM - 1) + Math.round(g.start_age * 12);
      const sy = Math.floor(totalM / 12);
      const sm = (totalM % 12) + 1;
      g.start_date = `${String(sy).padStart(4, '0')}-${String(sm).padStart(2, '0')}`;
    }
    if (!g.end_date && g.end_age != null) {
      const totalM = dobY * 12 + (dobM - 1) + Math.round(g.end_age * 12);
      const ey = Math.floor(totalM / 12);
      const em = (totalM % 12) + 1;
      g.end_date = `${String(ey).padStart(4, '0')}-${String(em).padStart(2, '0')}`;
    }
  }

  return cfg;
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function parseYm(s: string): [number, number] {
  const parts = s.split('-');
  return [parseInt(parts[0]!, 10), parseInt(parts[1]!, 10)];
}
