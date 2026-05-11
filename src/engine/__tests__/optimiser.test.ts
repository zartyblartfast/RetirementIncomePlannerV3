import { describe, expect, it } from 'vitest';
import {
  analyseDrawdownOrders,
  findMaxSustainableIncome,
  incomeSweep,
} from '../optimiser';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG, SIMPLE_CONFIG } from './fixtures';
import type { OrderMetrics } from '../optimiser';
import type { PlannerConfig, ProjectionResult } from '../types';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function makeThreeSourceConfig(): PlannerConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.personal.end_age = 72;
  cfg.target_income.net_annual = 32000;
  cfg.drawdown_strategy = 'fixed_target';
  cfg.drawdown_strategy_params = { net_annual: 32000 };
  cfg.guaranteed_income = cfg.guaranteed_income.map(income => ({
    ...income,
    start_date: '2026-04',
    start_age: undefined,
  }));
  cfg.dc_pots = cfg.dc_pots.map((pot, index) => ({
    ...pot,
    starting_balance: index === 0 ? 75000 : 55000,
    growth_rate: index === 0 ? 0.035 : 0.025,
    annual_fees: 0.002,
    values_as_of: '2026-04',
  }));
  cfg.tax_free_accounts = cfg.tax_free_accounts.map(account => ({
    ...account,
    starting_balance: 35000,
    growth_rate: 0.02,
    values_as_of: '2026-04',
  }));
  cfg.withdrawal_priority = ['Employer DC Pot', 'Consolidated DC Pot', 'ISA'];
  return cfg;
}

function makeMixedTaxFreePotConfig(): PlannerConfig {
  const cfg = cloneConfig(SIMPLE_CONFIG);
  cfg.personal.end_age = 72;
  cfg.target_income.net_annual = 26000;
  cfg.drawdown_strategy = 'fixed_target';
  cfg.drawdown_strategy_params = { net_annual: 26000 };
  cfg.guaranteed_income = [{
    name: 'State Pension',
    gross_annual: 12000,
    indexation_rate: 0,
    start_date: '2028-01',
    end_date: null,
    taxable: true,
    values_as_of: '2028-01',
  }];
  cfg.dc_pots = [
    {
      name: 'Taxable DC',
      starting_balance: 45000,
      growth_rate: 0,
      annual_fees: 0,
      tax_free_portion: 0,
      values_as_of: '2028-01',
    },
    {
      name: 'TFC DC',
      starting_balance: 45000,
      growth_rate: 0,
      annual_fees: 0,
      tax_free_portion: 0.25,
      values_as_of: '2028-01',
    },
    {
      name: 'Fully Tax-Free DC',
      starting_balance: 45000,
      growth_rate: 0,
      annual_fees: 0,
      tax_free_portion: 1,
      values_as_of: '2028-01',
    },
  ];
  cfg.tax_free_accounts = [];
  cfg.withdrawal_priority = ['Taxable DC', 'TFC DC', 'Fully Tax-Free DC'];
  return cfg;
}

function expectedMetricsFor(order: string[], projection: ProjectionResult): OrderMetrics {
  let depletionAge: number | null = null;
  for (const yr of projection.years) {
    if (yr.total_capital < 1) {
      depletionAge = yr.age;
      break;
    }
  }

  return {
    order,
    label: order.join(' → '),
    sustainable: projection.summary.sustainable,
    remaining_capital: Math.round(projection.summary.remaining_capital),
    total_tax: Math.round(projection.summary.total_tax_paid),
    total_income: Math.round(
      projection.years.reduce((sum, yr) => sum + yr.net_income_achieved, 0),
    ),
    first_shortfall_age: projection.summary.first_shortfall_age,
    depletion_age: depletionAge,
  };
}

function byLabel(metrics: OrderMetrics[], label: string): OrderMetrics {
  const found = metrics.find(metric => metric.label === label);
  expect(found, `missing optimiser metrics for ${label}`).toBeDefined();
  return found!;
}

describe('Optimiser — drawdown order analysis', () => {
  it('evaluates every drawdown-order permutation for all drawable sources', () => {
    const cfg = makeThreeSourceConfig();

    const result = analyseDrawdownOrders(cfg);

    expect(result.currentOrder).toEqual(['Employer DC Pot', 'Consolidated DC Pot', 'ISA']);
    expect(result.currentLabel).toBe('Employer DC Pot → Consolidated DC Pot → ISA');
    expect(result.permutations).toHaveLength(6);
    expect(new Set(result.permutations.map(metric => metric.label))).toEqual(new Set([
      'Consolidated DC Pot → Employer DC Pot → ISA',
      'Consolidated DC Pot → ISA → Employer DC Pot',
      'Employer DC Pot → Consolidated DC Pot → ISA',
      'Employer DC Pot → ISA → Consolidated DC Pot',
      'ISA → Consolidated DC Pot → Employer DC Pot',
      'ISA → Employer DC Pot → Consolidated DC Pot',
    ]));
  });

  it('reports optimiser metrics that match direct projection results for every order', () => {
    const cfg = makeThreeSourceConfig();

    const result = analyseDrawdownOrders(cfg);

    for (const metric of result.permutations) {
      const directCfg = cloneConfig(cfg);
      directCfg.withdrawal_priority = metric.order;
      const directProjection = runProjection(directCfg);
      expect(metric).toEqual(expectedMetricsFor(metric.order, directProjection));
    }
  });

  it('keeps mixed tax-free DC pot cases order-sensitive and consistent with direct projections', () => {
    const cfg = makeMixedTaxFreePotConfig();

    const result = analyseDrawdownOrders(cfg);

    expect(result.permutations).toHaveLength(6);

    const taxableFirst = byLabel(result.permutations, 'Taxable DC → TFC DC → Fully Tax-Free DC');
    const taxFreeFirst = byLabel(result.permutations, 'Fully Tax-Free DC → TFC DC → Taxable DC');

    expect(taxFreeFirst.total_tax).toBeLessThan(taxableFirst.total_tax);
    expect(taxFreeFirst.remaining_capital).toBeGreaterThanOrEqual(taxableFirst.remaining_capital);

    for (const metric of [taxableFirst, taxFreeFirst]) {
      const directCfg = cloneConfig(cfg);
      directCfg.withdrawal_priority = metric.order;
      expect(metric).toEqual(expectedMetricsFor(metric.order, runProjection(directCfg)));
    }
  });
});

describe('Optimiser — sustainable income search', () => {
  it('returns a max income whose reported metrics reconcile with direct projection and sweep points', () => {
    const cfg = cloneConfig(SIMPLE_CONFIG);
    cfg.personal.end_age = 75;
    cfg.target_income.net_annual = 22000;
    cfg.drawdown_strategy = 'fixed_target';
    cfg.drawdown_strategy_params = { net_annual: 22000 };

    const result = findMaxSustainableIncome(cfg);
    const maxCfg = cloneConfig(cfg);
    maxCfg.target_income.net_annual = result.max_income;
    maxCfg.drawdown_strategy_params = { net_annual: result.max_income };
    const directProjection = runProjection(maxCfg);
    const sweep = incomeSweep(cfg, result.max_income);

    expect(result.portfolio_driven).toBe(false);
    expect(result.current_income).toBe(22000);
    expect(result.headroom).toBe(result.max_income - result.current_income);
    expect(directProjection.summary.sustainable).toBe(true);

    for (const point of sweep) {
      const pointCfg = cloneConfig(cfg);
      pointCfg.target_income.net_annual = point.income;
      pointCfg.drawdown_strategy_params = { net_annual: point.income };
      const pointProjection = runProjection(pointCfg);
      expect(point.remaining_capital).toBe(Math.round(pointProjection.summary.remaining_capital));
      expect(point.total_tax).toBe(Math.round(pointProjection.summary.total_tax_paid));
      expect(point.first_shortfall_age).toBe(pointProjection.summary.first_shortfall_age);
      expect(point.sustainable).toBe(pointProjection.summary.sustainable);
    }
  });
});
