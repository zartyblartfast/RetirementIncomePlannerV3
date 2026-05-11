import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { calculateTax, calculateTaxFromEventsWithModule } from '../tax';
import { taxConfigFromRulePack } from '../taxRulePacks';
import { totalTaxableFromEvents, yearRowToTaxEvents } from '../taxEvents';
import { SIMPLE_CONFIG } from './fixtures';
import type { PlannerConfig, TaxConfig, TaxResult } from '../types';

interface ExpectedTaxSnapshot {
  income: number;
  total: number;
  personalAllowance: number;
  incomeAfterPa: number;
  marginalRate: number;
  bandTaxes: number[];
  taxCapApplied?: boolean;
}

function expectTaxSnapshot(tax: TaxConfig, expected: ExpectedTaxSnapshot): TaxResult {
  const result = calculateTax(expected.income, tax);

  expect(result.taxable_income).toBe(expected.income);
  expect(result.total).toBeCloseTo(expected.total, 2);
  expect(result.personal_allowance).toBeCloseTo(expected.personalAllowance, 2);
  expect(result.income_after_pa).toBeCloseTo(expected.incomeAfterPa, 2);
  expect(result.marginal_rate).toBe(expected.marginalRate);
  expect(result.tax_cap_applied).toBe(expected.taxCapApplied ?? false);
  expect(result.bands.map(band => band.tax)).toEqual(expected.bandTaxes);

  return result;
}

function mixedSourceProjectionConfig(): PlannerConfig {
  return {
    ...JSON.parse(JSON.stringify(SIMPLE_CONFIG)),
    target_income: { net_annual: 32_000, cpi_rate: 0 },
    guaranteed_income: [
      {
        name: 'State Pension',
        gross_annual: 12_000,
        indexation_rate: 0,
        start_date: '2028-01',
        end_age: null,
        taxable: true,
        values_as_of: '2028-01',
      },
    ],
    dc_pots: [
      {
        name: 'Main DC',
        starting_balance: 250_000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2028-01',
      },
    ],
    tax_free_accounts: [
      {
        name: 'ISA',
        starting_balance: 40_000,
        growth_rate: 0,
        values_as_of: '2028-01',
      },
    ],
    withdrawal_priority: ['ISA', 'Main DC'],
    tax: taxConfigFromRulePack('IM-2026-27'),
  };
}

function expectProjectionTaxMatchesTaxableIncomeCalculation(
  taxConfig: TaxConfig,
  year: { total_taxable_income: number; tax_due: number; tax_breakdown: TaxResult },
): void {
  const expectedTax = calculateTax(year.total_taxable_income, taxConfig);

  expect(year.tax_due).toBeCloseTo(expectedTax.total, 2);
  expect(year.tax_breakdown).toEqual(expectedTax);
}

function expectProjectionTaxMatchesEventCalculation(
  taxConfig: TaxConfig,
  year: Parameters<typeof yearRowToTaxEvents>[0],
): void {
  const events = yearRowToTaxEvents(year);
  const expectedTax = calculateTaxFromEventsWithModule(events, taxConfig);

  expect(totalTaxableFromEvents(events)).toBeCloseTo(year.total_taxable_income, 2);
  expect(year.tax_due).toBeCloseTo(expectedTax.total, 2);
  expect(year.tax_breakdown).toEqual(expectedTax);
}

describe('Tax compatibility baselines', () => {
  it('freezes the current custom simple-banded tax behaviour', () => {
    const tax: TaxConfig = {
      regime: 'Custom',
      personal_allowance: 14_500,
      bands: [
        { name: 'Lower rate', width: 6_500, rate: 0.10 },
        { name: 'Higher rate', width: null, rate: 0.20 },
      ],
      tax_cap_enabled: false,
      tax_cap_amount: 200_000,
    };

    expectTaxSnapshot(tax, {
      income: 25_000,
      total: 1_450,
      personalAllowance: 14_500,
      incomeAfterPa: 10_500,
      marginalRate: 0.20,
      bandTaxes: [650, 800],
    });
  });

  it('freezes UK England/Wales/NI 2026-27 outputs at boundary, taper, and additional-rate points', () => {
    const tax = taxConfigFromRulePack('GB-EWNI-2026-27');

    expectTaxSnapshot(tax, {
      income: 12_570,
      total: 0,
      personalAllowance: 12_570,
      incomeAfterPa: 0,
      marginalRate: 0,
      bandTaxes: [0],
    });
    expectTaxSnapshot(tax, {
      income: 60_000,
      total: 11_432,
      personalAllowance: 12_570,
      incomeAfterPa: 47_430,
      marginalRate: 0.40,
      bandTaxes: [7_540, 3_892],
    });
    expectTaxSnapshot(tax, {
      income: 110_000,
      total: 33_432,
      personalAllowance: 7_570,
      incomeAfterPa: 102_430,
      marginalRate: 0.40,
      bandTaxes: [7_540, 25_892],
    });
    expectTaxSnapshot(tax, {
      income: 130_000,
      total: 44_703,
      personalAllowance: 0,
      incomeAfterPa: 130_000,
      marginalRate: 0.45,
      bandTaxes: [7_540, 34_976, 2_187],
    });
  });

  it('freezes Scotland 2026-27 outputs across starter through top-rate bands', () => {
    const tax = taxConfigFromRulePack('GB-SCT-2026-27');

    expectTaxSnapshot(tax, {
      income: 30_000,
      total: 3_451.07,
      personalAllowance: 12_570,
      incomeAfterPa: 17_430,
      marginalRate: 0.21,
      bandTaxes: [753.73, 2_597.8, 99.54],
    });
    expectTaxSnapshot(tax, {
      income: 60_000,
      total: 13_182.05,
      personalAllowance: 12_570,
      incomeAfterPa: 47_430,
      marginalRate: 0.42,
      bandTaxes: [753.73, 2_597.8, 2_968.56, 6_861.96],
    });
    expectTaxSnapshot(tax, {
      income: 130_000,
      total: 50_034.35,
      personalAllowance: 0,
      incomeAfterPa: 130_000,
      marginalRate: 0.48,
      bandTaxes: [753.73, 2_597.8, 2_968.56, 13_161.96, 28_219.5, 2_332.8],
    });
  });

  it('freezes Isle of Man 2026-27 ordinary-income and optional tax-cap behaviour', () => {
    const tax = taxConfigFromRulePack('IM-2026-27');

    expectTaxSnapshot(tax, {
      income: 30_000,
      total: 2_015,
      personalAllowance: 17_000,
      incomeAfterPa: 13_000,
      marginalRate: 0.21,
      bandTaxes: [650, 1_365],
    });
    expectTaxSnapshot(tax, {
      income: 110_000,
      total: 19_865,
      personalAllowance: 12_000,
      incomeAfterPa: 98_000,
      marginalRate: 0.21,
      bandTaxes: [650, 19_215],
    });
    expectTaxSnapshot(
      { ...tax, tax_cap_enabled: true },
      {
        income: 1_100_000,
        total: 220_000,
        personalAllowance: 0,
        incomeAfterPa: 1_100_000,
        marginalRate: 0.21,
        bandTaxes: [650, 229_635],
        taxCapApplied: true,
      },
    );
  });

  it('freezes current projection tax fields for mixed guaranteed income, ISA, and DC drawdown', () => {
    const cfg = mixedSourceProjectionConfig();
    const result = runProjection(cfg, { includeMonthly: true });
    const isaYear = result.years[0]!;
    const dcYear = result.years[2]!;

    expect(result.summary.total_tax_paid).toBeCloseTo(18_477.24, 2);
    expect(result.summary.first_pot_exhausted_age).toBe(69);
    expect(result.summary.depletion_events).toEqual([
      { pot: 'ISA', age: 69, month: 12 },
      { pot: 'Main DC', age: 81, month: 7 },
    ]);
    for (const year of result.years) {
      expectProjectionTaxMatchesTaxableIncomeCalculation(cfg.tax, year);
      expectProjectionTaxMatchesEventCalculation(cfg.tax, year);
    }

    expect(isaYear.age).toBe(68);
    expect(isaYear.guaranteed_total).toBe(12_000);
    expect(isaYear.tf_withdrawal).toBe(20_000);
    expect(isaYear.dc_withdrawal_gross).toBe(0);
    expect(isaYear.total_taxable_income).toBe(12_000);
    expect(isaYear.tax_due).toBe(0);
    expect(isaYear.net_income_achieved).toBe(32_000);

    expect(dcYear.age).toBe(70);
    expect(dcYear.guaranteed_total).toBe(12_000);
    expect(dcYear.tf_withdrawal).toBe(0);
    expect(dcYear.dc_withdrawal_gross).toBeCloseTo(21_644.29, 2);
    expect(dcYear.dc_tax_free_portion).toBeCloseTo(5_411.07, 2);
    expect(dcYear.withdrawal_detail['Main DC']).toBeCloseTo(20_000.31, 2);
    expect(dcYear.total_taxable_income).toBeCloseTo(28_233.22, 2);
    expect(dcYear.tax_due).toBeCloseTo(1_643.98, 2);
    expect(dcYear.tax_breakdown.total).toBeCloseTo(1_643.98, 2);
    expect(dcYear.tax_breakdown.bands.map(band => band.tax)).toEqual([650, 993.98]);
    expect(dcYear.net_income_achieved).toBeCloseTo(32_000.31, 2);
  });
});
