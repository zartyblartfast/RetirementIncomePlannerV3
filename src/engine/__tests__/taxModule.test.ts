import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import {
  calculateTax,
  calculateTaxFromEventsWithModule,
  calculateTaxWithModule,
  getTaxRuleModule,
  simpleBandedTaxModule,
} from '../tax';
import { TAX_RULE_PACKS, taxConfigFromRulePack } from '../taxRulePacks';
import { yearRowToTaxEvents } from '../taxEvents';
import { SIMPLE_CONFIG } from './fixtures';
import type { PlannerConfig, TaxConfig, TaxResult } from '../types';

function expectSameTaxResult(actual: TaxResult, expected: TaxResult): void {
  expect(actual).toEqual(expected);
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

describe('Tax rule modules', () => {
  it('selects the simple banded first-party module for current tax configs', () => {
    for (const pack of TAX_RULE_PACKS) {
      expect(pack.tax_module_id).toBe('simple-banded');
      expect(pack.tax_config.tax_module_id).toBe('simple-banded');
      expect(getTaxRuleModule(pack.tax_config)).toBe(simpleBandedTaxModule);
    }
  });

  it('keeps legacy configs without a module id on the simple banded fallback path', () => {
    const tax: TaxConfig = {
      regime: 'Legacy Custom',
      personal_allowance: 12_570,
      bands: [{ name: 'Basic', width: null, rate: 0.2 }],
    };

    expect(getTaxRuleModule(tax)).toBe(simpleBandedTaxModule);
    expect(calculateTax(30_000, tax).total).toBe(3_486);
  });

  it('rejects unknown explicit tax module ids instead of silently falling back', () => {
    const tax: TaxConfig = {
      regime: 'Future unsupported module',
      tax_module_id: 'future-module',
      personal_allowance: 12_570,
      bands: [{ name: 'Basic', width: null, rate: 0.2 }],
    };

    expect(() => getTaxRuleModule(tax)).toThrow('Unknown tax module: future-module');
  });

  it('keeps calculateTax behaviour identical when routed through the selected module', () => {
    const incomes = [0, 12_570, 30_000, 60_000, 110_000, 130_000, 1_100_000];

    for (const pack of TAX_RULE_PACKS) {
      const tax = taxConfigFromRulePack(pack.id);
      const module = getTaxRuleModule(tax);

      for (const income of incomes) {
        expectSameTaxResult(
          calculateTaxWithModule(income, tax, module),
          calculateTax(income, tax),
        );
      }
    }
  });

  it('keeps optional tax-cap behaviour identical through the module interface', () => {
    const tax = {
      ...taxConfigFromRulePack('IM-2026-27'),
      tax_cap_enabled: true,
    };

    expectSameTaxResult(
      calculateTaxWithModule(1_100_000, tax, simpleBandedTaxModule),
      calculateTax(1_100_000, tax),
    );
  });

  it('calculates event-based tax equal to taxable-income-based tax for mixed income projection rows', () => {
    const cfg = mixedSourceProjectionConfig();
    const result = runProjection(cfg);
    const module = getTaxRuleModule(cfg.tax);
    const selectedYears = [result.years[0]!, result.years[1]!, result.years[2]!];

    expect(selectedYears.some(year => year.tf_withdrawal > 0)).toBe(true);
    expect(selectedYears.some(year => year.dc_withdrawal_gross > 0)).toBe(true);

    for (const year of selectedYears) {
      const events = yearRowToTaxEvents(year);
      const eventBasedTax = calculateTaxFromEventsWithModule(events, cfg.tax, module);
      const taxableIncomeBasedTax = calculateTax(year.total_taxable_income, cfg.tax);

      expect(events.some(event => event.category === 'guaranteed_income')).toBe(true);
      expectSameTaxResult(eventBasedTax, taxableIncomeBasedTax);
      expectSameTaxResult(eventBasedTax, year.tax_breakdown);
    }
  });

  it('rejects explicitly supplied modules that do not support a config', () => {
    const tax: TaxConfig = {
      regime: 'Custom',
      personal_allowance: 12_570,
      bands: [{ name: 'Basic', width: null, rate: 0.2 }],
    };

    expect(() => calculateTaxWithModule(30_000, tax, {
      id: 'unsupported-test-module',
      label: 'Unsupported test module',
      supports: () => false,
      calculate: () => calculateTax(30_000, tax),
      calculateFromEvents: () => calculateTax(30_000, tax),
    })).toThrow('Tax module unsupported-test-module does not support regime: Custom');
  });
});
