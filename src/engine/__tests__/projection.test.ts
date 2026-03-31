import { describe, it, expect } from 'vitest';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG, SIMPLE_CONFIG } from './fixtures';
import type { PlannerConfig } from '../types';

describe('Projection — Simple config', () => {
  const result = runProjection(SIMPLE_CONFIG);

  it('produces year rows', () => {
    expect(result.years.length).toBeGreaterThan(0);
  });

  it('first year age matches retirement age', () => {
    expect(result.years[0]!.age).toBe(68);
  });

  it('last year age matches end_age', () => {
    expect(result.years[result.years.length - 1]!.age).toBe(90);
  });

  it('summary has expected fields', () => {
    expect(result.summary).toHaveProperty('sustainable');
    expect(result.summary).toHaveProperty('remaining_capital');
    expect(result.summary).toHaveProperty('total_tax_paid');
    expect(result.summary).toHaveProperty('uk_tax_saving');
    expect(result.summary.end_age).toBe(90);
  });

  it('total tax is positive', () => {
    expect(result.summary.total_tax_paid).toBeGreaterThan(0);
  });

  it('UK tax saving is positive (IoM cheaper than UK)', () => {
    expect(result.summary.uk_tax_saving).toBeGreaterThan(0);
  });

  it('net income achieved in first year is close to target', () => {
    const yr1 = result.years[0]!;
    // Net income should be close to target — allow £250 tolerance
    // for DC tax gross-up rounding over 12 monthly withdrawals
    expect(Math.abs(yr1.net_income_achieved - yr1.target_net)).toBeLessThan(250);
  });
});

describe('Projection — Default config', () => {
  const result = runProjection(DEFAULT_CONFIG);

  it('produces 23 year rows (age 68-90)', () => {
    expect(result.years.length).toBe(23);
  });

  it('has both DC pots in first year balances', () => {
    const yr1 = result.years[0]!;
    expect(yr1.pot_balances).toHaveProperty('Consolidated DC Pot');
    expect(yr1.pot_balances).toHaveProperty('Employer DC Pot');
  });

  it('has ISA in tf_balances', () => {
    const yr1 = result.years[0]!;
    expect(yr1.tf_balances).toHaveProperty('ISA');
  });

  it('guaranteed income has both pensions', () => {
    const yr1 = result.years[0]!;
    expect(yr1.guaranteed_income).toHaveProperty('UK State Pension');
    expect(yr1.guaranteed_income).toHaveProperty('BP Pension (DB)');
    expect(yr1.guaranteed_income['UK State Pension']).toBeGreaterThan(0);
    expect(yr1.guaranteed_income['BP Pension (DB)']).toBeGreaterThan(0);
  });

  it('withdrawal priority is respected (Employer DC drawn first)', () => {
    const yr1 = result.years[0]!;
    const empWd = yr1.withdrawal_detail['Employer DC Pot'] ?? 0;
    // Employer DC should have withdrawals in year 1 (it's first priority)
    expect(empWd).toBeGreaterThan(0);
  });

  it('tax breakdown has IoM bands', () => {
    const yr1 = result.years[0]!;
    expect(yr1.iom_tax_breakdown.bands.length).toBeGreaterThan(0);
    expect(yr1.iom_tax_breakdown.personal_allowance).toBe(14500);
  });

  it('UK tax comparison is calculated', () => {
    const yr1 = result.years[0]!;
    expect(yr1.uk_tax_due).toBeGreaterThan(0);
  });

  it('pot P&L has opening/growth/fees/closing', () => {
    const yr1 = result.years[0]!;
    const pnl = yr1.pot_pnl['Consolidated DC Pot']!;
    expect(pnl.opening).toBeGreaterThan(0);
    expect(pnl.growth).toBeGreaterThan(0);
    expect(pnl.fees).toBeGreaterThanOrEqual(0);
    expect(pnl.closing).toBeGreaterThan(0);
  });
});

describe('Projection — Fixed Percentage strategy', () => {
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    drawdown_strategy: 'fixed_percentage',
    drawdown_strategy_params: { withdrawal_rate: 4.0 },
  };
  const result = runProjection(cfg);

  it('runs without error', () => {
    expect(result.years.length).toBeGreaterThan(0);
  });

  it('summary has valid fields', () => {
    expect(result.summary.total_tax_paid).toBeGreaterThanOrEqual(0);
  });
});

describe('Projection — ARVA strategy', () => {
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    drawdown_strategy: 'arva',
    drawdown_strategy_params: { assumed_real_return_pct: 3, target_end_age: 90 },
  };
  const result = runProjection(cfg);

  it('runs without error', () => {
    expect(result.years.length).toBeGreaterThan(0);
  });

  it('is sustainable (ARVA targets depletion at end_age)', () => {
    expect(result.summary.sustainable).toBe(true);
  });
});

describe('Projection — Vanguard Dynamic strategy', () => {
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    drawdown_strategy: 'vanguard_dynamic',
    drawdown_strategy_params: { initial_target: 25000, max_increase_pct: 5, max_decrease_pct: 2.5 },
  };
  const result = runProjection(cfg);

  it('runs without error', () => {
    expect(result.years.length).toBeGreaterThan(0);
  });
});

describe('Projection — Guyton-Klinger strategy', () => {
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    drawdown_strategy: 'guyton_klinger',
    drawdown_strategy_params: {
      initial_target: 25000, upper_guardrail_pct: 5.5,
      lower_guardrail_pct: 3.5, raise_pct: 10, cut_pct: 10,
    },
  };
  const result = runProjection(cfg);

  it('runs without error', () => {
    expect(result.years.length).toBeGreaterThan(0);
  });
});

describe('Projection — Monthly rows', () => {
  const result = runProjection(SIMPLE_CONFIG, { includeMonthly: true });

  it('produces monthly_rows', () => {
    expect(result.monthly_rows).toBeDefined();
    expect(result.monthly_rows!.length).toBeGreaterThan(0);
  });

  it('first monthly row has expected structure', () => {
    const m1 = result.monthly_rows![0]!;
    expect(m1).toHaveProperty('age');
    expect(m1).toHaveProperty('month');
    expect(m1).toHaveProperty('total_capital');
    expect(m1).toHaveProperty('guaranteed_total');
  });
});

describe('Projection — Depletion detection', () => {
  // Config with very high target to force depletion
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    target_income: { net_annual: 100000, cpi_rate: 0.02 },
  };
  const result = runProjection(cfg);

  it('detects shortfall', () => {
    expect(result.summary.sustainable).toBe(false);
    expect(result.summary.first_shortfall_age).not.toBeNull();
  });

  it('records depletion events', () => {
    expect(result.summary.depletion_events.length).toBeGreaterThan(0);
  });

  it('adds warnings', () => {
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
