import { describe, it, expect } from 'vitest';
import { computeAnnualTarget, normalizeConfig, STRATEGIES, getStrategyDisplayName } from '../strategies';
import type { PlannerConfig } from '../types';
import { SIMPLE_CONFIG } from './fixtures';

describe('Strategy registry', () => {
  it('has 6 strategies', () => {
    expect(Object.keys(STRATEGIES).length).toBe(6);
  });

  it('display names resolve', () => {
    expect(getStrategyDisplayName('fixed_target')).toBe('Fixed Target');
    expect(getStrategyDisplayName('arva')).toBe('ARVA');
    expect(getStrategyDisplayName('unknown')).toBe('unknown');
  });
});

describe('Fixed Target', () => {
  it('returns net mode with configured amount', () => {
    const [target, state] = computeAnnualTarget('fixed_target', { net_annual: 30000 }, null, 300000, 0.03);
    expect(target.mode).toBe('net');
    expect(target.annual_amount).toBe(30000);
    expect(state).not.toBeNull();
  });
});

describe('Fixed Percentage', () => {
  it('returns gross mode = portfolio × rate', () => {
    const [target] = computeAnnualTarget('fixed_percentage', { withdrawal_rate: 4.0 }, null, 300000, 0.03);
    expect(target.mode).toBe('gross');
    expect(target.annual_amount).toBe(12000); // 300000 * 0.04
  });
});

describe('Vanguard Dynamic', () => {
  it('first year returns initial target', () => {
    const [target, state] = computeAnnualTarget('vanguard_dynamic',
      { initial_target: 30000, max_increase_pct: 5, max_decrease_pct: 2.5 },
      null, 300000, 0.03);
    expect(target.mode).toBe('net');
    expect(target.annual_amount).toBe(30000);
    expect(state).toHaveProperty('prev_target', 30000);
  });

  it('second year CPI-adjusts within caps', () => {
    const state1 = { prev_target: 30000 };
    const [target] = computeAnnualTarget('vanguard_dynamic',
      { initial_target: 30000, max_increase_pct: 5, max_decrease_pct: 2.5 },
      state1, 300000, 0.03);
    // CPI 3% → 30900, max up 5% → 31500, so 30900 within cap
    expect(target.annual_amount).toBeCloseTo(30900, 0);
  });

  it('caps large decrease', () => {
    const state1 = { prev_target: 30000 };
    // -10% CPI would give 27000, but max decrease is 2.5% → 29250
    const [target] = computeAnnualTarget('vanguard_dynamic',
      { initial_target: 30000, max_increase_pct: 5, max_decrease_pct: 2.5 },
      state1, 300000, -0.10);
    expect(target.annual_amount).toBeCloseTo(29250, 0);
  });
});

describe('Guyton-Klinger', () => {
  it('first year returns initial target', () => {
    const [target, state] = computeAnnualTarget('guyton_klinger',
      { initial_target: 30000, upper_guardrail_pct: 5.5, lower_guardrail_pct: 3.5, raise_pct: 10, cut_pct: 10 },
      null, 300000, 0.03);
    expect(target.mode).toBe('net');
    expect(target.annual_amount).toBe(30000);
    expect(state).toHaveProperty('current_target');
  });
});

describe('ARVA', () => {
  it('returns pot_net mode', () => {
    const [target] = computeAnnualTarget('arva',
      { assumed_real_return_pct: 3, target_end_age: 90 },
      null, 200000, 0.03, 68);
    expect(target.mode).toBe('pot_net');
    expect(target.annual_amount).toBeGreaterThan(0);
  });

  it('withdrawal increases as remaining years decrease', () => {
    const params = { assumed_real_return_pct: 3, target_end_age: 90 };
    const [t1] = computeAnnualTarget('arva', params, null, 200000, 0.03, 68);
    const [t2] = computeAnnualTarget('arva', params, null, 200000, 0.03, 85);
    // At age 85 with 5 years left, withdrawal should be higher than at 68 with 22 years
    expect(t2.annual_amount).toBeGreaterThan(t1.annual_amount);
  });
});

describe('ARVA + Guardrails', () => {
  it('clamps year-to-year changes', () => {
    const params = { assumed_real_return_pct: 3, target_end_age: 90, max_annual_increase_pct: 10, max_annual_decrease_pct: 10 };
    const [t1, s1] = computeAnnualTarget('arva_guardrails', params, null, 200000, 0.03, 68);
    // Simulate big portfolio drop → raw ARVA would drop a lot
    const [t2] = computeAnnualTarget('arva_guardrails', params, s1, 100000, 0.03, 69);
    // Should be clamped to at most 10% decrease
    expect(t2.annual_amount).toBeGreaterThanOrEqual(t1.annual_amount * 0.9 - 1);
  });
});

describe('normalizeConfig', () => {
  it('adds drawdown_strategy_params if missing', () => {
    const cfg: PlannerConfig = JSON.parse(JSON.stringify(SIMPLE_CONFIG));
    delete cfg.drawdown_strategy;
    delete cfg.drawdown_strategy_params;
    normalizeConfig(cfg);
    expect(cfg.drawdown_strategy).toBe('fixed_target');
    expect(cfg.drawdown_strategy_params).toBeDefined();
    expect(cfg.drawdown_strategy_params!.net_annual).toBe(25000);
  });

  it('migrates start_age to start_date', () => {
    const cfg: PlannerConfig = JSON.parse(JSON.stringify(SIMPLE_CONFIG));
    // Remove start_date, add start_age
    delete cfg.guaranteed_income[0]!.start_date;
    cfg.guaranteed_income[0]!.start_age = 68;
    normalizeConfig(cfg);
    expect(cfg.guaranteed_income[0]!.start_date).toBe('2028-01');
  });
});
