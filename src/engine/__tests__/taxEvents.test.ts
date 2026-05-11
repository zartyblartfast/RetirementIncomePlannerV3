import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { taxConfigFromRulePack } from '../taxRulePacks';
import { totalGrossFromEvents, totalTaxableFromEvents, yearRowToTaxEvents } from '../taxEvents';
import { SIMPLE_CONFIG } from './fixtures';
import type { PlannerConfig } from '../types';

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

describe('Tax events', () => {
  it('adapts a YearRow with guaranteed income and ISA withdrawal into neutral tax events', () => {
    const result = runProjection(mixedSourceProjectionConfig());
    const year = result.years[0]!;
    const events = yearRowToTaxEvents(year);

    expect(events).toEqual([
      {
        tax_year: '2028/29',
        age: 68,
        category: 'guaranteed_income',
        source: 'Guaranteed income',
        gross_amount: 12_000,
        taxable_amount: 12_000,
      },
      {
        tax_year: '2028/29',
        age: 68,
        category: 'tax_free_account_withdrawal',
        source: 'Tax-free account withdrawal',
        gross_amount: 20_000,
        taxable_amount: 0,
      },
    ]);
    expect(totalTaxableFromEvents(events)).toBe(year.total_taxable_income);
    expect(totalGrossFromEvents(events)).toBe(year.net_income_achieved + year.tax_due);
  });

  it('adapts a YearRow with DC taxable and tax-free portions without changing taxable totals', () => {
    const result = runProjection(mixedSourceProjectionConfig());
    const year = result.years[2]!;
    const events = yearRowToTaxEvents(year);

    expect(events).toEqual([
      {
        tax_year: '2030/31',
        age: 70,
        category: 'guaranteed_income',
        source: 'Guaranteed income',
        gross_amount: 12_000,
        taxable_amount: 12_000,
      },
      {
        tax_year: '2030/31',
        age: 70,
        category: 'dc_pension_taxable',
        source: 'DC pension drawdown',
        gross_amount: 16_233.22,
        taxable_amount: 16_233.22,
      },
      {
        tax_year: '2030/31',
        age: 70,
        category: 'dc_pension_tax_free',
        source: 'DC pension tax-free portion',
        gross_amount: 5_411.07,
        taxable_amount: 0,
      },
    ]);
    expect(totalTaxableFromEvents(events)).toBe(year.total_taxable_income);
    expect(totalGrossFromEvents(events)).toBeCloseTo(year.guaranteed_total + year.dc_withdrawal_gross + year.tf_withdrawal, 2);
  });

  it('keeps non-taxable guaranteed income out of the taxable event total', () => {
    const cfg: PlannerConfig = {
      ...mixedSourceProjectionConfig(),
      target_income: { net_annual: 30_000, cpi_rate: 0 },
      guaranteed_income: [
        {
          name: 'Taxable Pension',
          gross_annual: 12_000,
          indexation_rate: 0,
          start_date: '2028-01',
          end_age: null,
          taxable: true,
          values_as_of: '2028-01',
        },
        {
          name: 'Non-taxable Income',
          gross_annual: 6_000,
          indexation_rate: 0,
          start_date: '2028-01',
          end_age: null,
          taxable: false,
          values_as_of: '2028-01',
        },
      ],
      tax_free_accounts: [],
      withdrawal_priority: ['Main DC'],
    };
    const result = runProjection(cfg);
    const year = result.years[0]!;
    const events = yearRowToTaxEvents(year);
    const guaranteedEvent = events.find(event => event.category === 'guaranteed_income');

    expect(year.guaranteed_total).toBe(18_000);
    expect(guaranteedEvent?.gross_amount).toBe(18_000);
    expect(guaranteedEvent?.taxable_amount).toBe(12_000);
    expect(totalTaxableFromEvents(events)).toBe(year.total_taxable_income);
  });
});
