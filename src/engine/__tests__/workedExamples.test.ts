/**
 * Worked example tests.
 *
 * These tests mirror docs/calculation-worked-examples.md. They are deliberately
 * small so the expected values can be checked by hand or spreadsheet.
 */
import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import type { PlannerConfig, PersonalConfig, TargetIncomeConfig, TaxConfig } from '../types';

const ZERO_TAX: TaxConfig = {
  regime: 'Worked example: zero tax',
  personal_allowance: 1_000_000,
  bands: [{ name: 'Zero', width: null, rate: 0 }],
};

const FLAT_20_TAX: TaxConfig = {
  regime: 'Worked example: flat 20%',
  personal_allowance: 0,
  bands: [{ name: 'Flat', width: null, rate: 0.2 }],
};

function expectGBP(actual: number | undefined, expected: number, tolerance = 1): void {
  expect(actual).toBeDefined();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
}

type ConfigOverrides = Omit<Partial<PlannerConfig>, 'personal' | 'target_income' | 'tax'> & {
  personal?: Partial<PersonalConfig>;
  target_income?: Partial<TargetIncomeConfig>;
  tax?: TaxConfig;
};

function baseConfig(overrides: ConfigOverrides = {}): PlannerConfig {
  const cfg: PlannerConfig = {
    personal: {
      date_of_birth: '1960-01',
      retirement_date: '2025-01',
      end_age: 66,
      currency: 'GBP',
    },
    target_income: {
      net_annual: 12_000,
      cpi_rate: 0,
    },
    guaranteed_income: [],
    dc_pots: [],
    tax_free_accounts: [],
    withdrawal_priority: [],
    tax: ZERO_TAX,
    drawdown_strategy: 'fixed_target',
    drawdown_strategy_params: { net_annual: 12_000 },
  };

  return {
    ...cfg,
    ...overrides,
    personal: { ...cfg.personal, ...overrides.personal },
    target_income: { ...cfg.target_income, ...overrides.target_income },
    tax: { ...cfg.tax, ...overrides.tax },
  };
}

describe('worked examples: simple income mechanics', () => {
  it('Example 1: one DC pot, no tax, no growth', () => {
    const result = runProjection(baseConfig({
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 30_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
    }));

    expect(result.years).toHaveLength(2);
    expect(result.years[0]!.age).toBe(65);
    expectGBP(result.years[0]!.dc_withdrawal_gross, 12_000);
    expect(result.years[0]!.tax_due).toBe(0);
    expectGBP(result.years[0]!.net_income_achieved, 12_000);
    expectGBP(result.years[0]!.pot_balances['Main DC'], 18_000);

    expect(result.years[1]!.age).toBe(66);
    expectGBP(result.years[1]!.dc_withdrawal_gross, 12_000);
    expect(result.years[1]!.tax_due).toBe(0);
    expectGBP(result.years[1]!.net_income_achieved, 12_000);
    expectGBP(result.years[1]!.pot_balances['Main DC'], 6_000);
  });

  it('Example 2: guaranteed income only, no tax', () => {
    const result = runProjection(baseConfig({
      guaranteed_income: [{
        name: 'Guaranteed',
        gross_annual: 12_000,
        indexation_rate: 0,
        start_date: '2025-01',
        end_date: null,
        taxable: false,
        values_as_of: '2025-01',
      }],
    }));

    const yr = result.years[0]!;
    expectGBP(yr.target_net, 12_000);
    expectGBP(yr.guaranteed_total, 12_000);
    expect(yr.dc_withdrawal_gross).toBe(0);
    expect(yr.tf_withdrawal).toBe(0);
    expect(yr.tax_due).toBe(0);
    expectGBP(yr.net_income_achieved, 12_000);
  });

  it('Example 6: ISA-only withdrawals are tax-free', () => {
    const result = runProjection(baseConfig({
      tax: FLAT_20_TAX,
      tax_free_accounts: [{
        name: 'ISA',
        starting_balance: 20_000,
        growth_rate: 0,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['ISA'],
    }));

    const yr = result.years[0]!;
    expectGBP(yr.tf_withdrawal, 12_000);
    expect(yr.tax_due).toBe(0);
    expectGBP(yr.net_income_achieved, 12_000);
    expectGBP(yr.tf_balances['ISA'], 8_000);
  });
});

describe('worked examples: DC gross-up', () => {
  it('Example 3: one DC pot, 25% tax-free, flat 20% tax', () => {
    const result = runProjection(baseConfig({
      tax: FLAT_20_TAX,
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 50_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
    }));

    const yr = result.years[0]!;
    expectGBP(yr.dc_withdrawal_gross, 14_117.65);
    expectGBP(yr.dc_tax_free_portion, 3_529.41);
    expectGBP(yr.total_taxable_income, 10_588.24);
    expectGBP(yr.tax_due, 2_117.65);
    expectGBP(yr.net_income_achieved, 12_000);
  });

  it('Example 4: one DC pot, 0% tax-free, flat 20% tax', () => {
    const result = runProjection(baseConfig({
      tax: FLAT_20_TAX,
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 50_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
    }));

    const yr = result.years[0]!;
    expectGBP(yr.dc_withdrawal_gross, 15_000);
    expect(yr.dc_tax_free_portion).toBe(0);
    expectGBP(yr.total_taxable_income, 15_000);
    expectGBP(yr.tax_due, 3_000);
    expectGBP(yr.net_income_achieved, 12_000);
  });

  it('Example 5: two DC pots with different tax-free portions gross-up source by source', () => {
    const result = runProjection(baseConfig({
      tax: FLAT_20_TAX,
      dc_pots: [
        {
          name: 'Pot A',
          starting_balance: 6_000,
          growth_rate: 0,
          annual_fees: 0,
          tax_free_portion: 0,
          values_as_of: '2025-01',
        },
        {
          name: 'Pot B',
          starting_balance: 50_000,
          growth_rate: 0,
          annual_fees: 0,
          tax_free_portion: 0.25,
          values_as_of: '2025-01',
        },
      ],
      withdrawal_priority: ['Pot A', 'Pot B'],
    }));

    const yr = result.years[0]!;
    expectGBP(yr.withdrawal_detail['Pot A'], 4_800);
    expectGBP(yr.withdrawal_detail['Pot B'], 7_200);
    expectGBP(yr.dc_withdrawal_gross, 14_470.59);
    expectGBP(yr.dc_tax_free_portion, 2_117.65);
    expectGBP(yr.total_taxable_income, 12_352.94);
    expectGBP(yr.tax_due, 2_470.59);
    expectGBP(yr.net_income_achieved, 12_000);
    expectGBP(yr.pot_balances['Pot A'], 0);
    expectGBP(yr.pot_balances['Pot B'], 41_529.41);
  });
});

describe('worked examples: CPI target display', () => {
  it('Example 8: fixed target annual display is the sum of monthly CPI-adjusted targets', () => {
    const result = runProjection(baseConfig({
      target_income: {
        net_annual: 12_000,
        cpi_rate: 0.12682503013196977,
      },
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 50_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
      drawdown_strategy_params: { net_annual: 12_000 },
    }));

    const expectedTarget = Array.from({ length: 12 }, (_, month) =>
      1_000 * Math.pow(1.01, month)
    ).reduce((sum, target) => sum + target, 0);

    expectGBP(result.years[0]!.target_net, expectedTarget);
  });
});

describe('worked examples: mid-year guaranteed income', () => {
  it('Example 7: pot-net strategy counts only active guaranteed income months', () => {
    const result = runProjection(baseConfig({
      personal: { end_age: 66 },
      guaranteed_income: [{
        name: 'Mid-year pension',
        gross_annual: 6_000,
        indexation_rate: 0,
        start_date: '2025-07',
        end_date: null,
        taxable: false,
        values_as_of: '2025-01',
      }],
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 24_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
      drawdown_strategy: 'arva',
      drawdown_strategy_params: { assumed_real_return_pct: 0 },
    }));

    const yr = result.years[0]!;
    expectGBP(yr.guaranteed_total, 3_000);
    expectGBP(yr.target_net, 15_000);
    expectGBP(yr.dc_withdrawal_gross, 12_000);
    expectGBP(yr.net_income_achieved, 15_000);
    expectGBP(yr.pot_balances['Main DC'], 12_000);
  });
});

describe('worked examples: depletion and residual cleardown', () => {
  it('Example 9: clears small residual balances and records depletion month', () => {
    const result = runProjection(baseConfig({
      personal: { end_age: 66 },
      dc_pots: [{
        name: 'Main DC',
        starting_balance: 5_049,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      }],
      withdrawal_priority: ['Main DC'],
    }), {
      includeMonthly: true,
    });

    const yr = result.years[0]!;
    expectGBP(yr.target_net, 12_000);
    expectGBP(yr.dc_withdrawal_gross, 5_049);
    expectGBP(yr.net_income_achieved, 5_049);
    expectGBP(yr.pot_balances['Main DC'], 0);
    expect(yr.shortfall).toBe(true);

    expect(result.summary.first_shortfall_age).toBe(65);
    expect(result.summary.first_pot_exhausted_age).toBe(65);
    expect(result.summary.depletion_events).toContainEqual({
      pot: 'Main DC',
      age: 65,
      month: 5,
    });
    expect(result.summary.remaining_pots['Main DC']).toBe(0);
    expect(result.summary.remaining_capital).toBe(0);

    const month5 = result.monthly_rows?.find(row => row.age === 65 && row.month_in_year === 5);
    expect(month5).toBeDefined();
    expectGBP(month5!.withdrawal_detail['Main DC'], 1_049);
    expectGBP(month5!.dc_balances['Main DC'], 0);
    expect(month5!.depleted_this_month).toContain('Main DC');
  });
});
