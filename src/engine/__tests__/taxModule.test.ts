import { describe, expect, it } from 'vitest';
import {
  calculateTax,
  calculateTaxWithModule,
  getTaxRuleModule,
  simpleBandedTaxModule,
} from '../tax';
import { TAX_RULE_PACKS, taxConfigFromRulePack } from '../taxRulePacks';
import type { TaxConfig, TaxResult } from '../types';

function expectSameTaxResult(actual: TaxResult, expected: TaxResult): void {
  expect(actual).toEqual(expected);
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
    })).toThrow('Tax module unsupported-test-module does not support regime: Custom');
  });
});
