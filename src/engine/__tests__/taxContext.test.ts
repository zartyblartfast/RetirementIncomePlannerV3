import { describe, expect, it } from 'vitest';
import { deriveTaxContext } from '../taxContext';
import { taxConfigFromRulePack } from '../taxRulePacks';
import type { TaxConfig } from '../types';

describe('deriveTaxContext', () => {
  it('derives auditable metadata from a selected rule pack', () => {
    const context = deriveTaxContext(taxConfigFromRulePack('GB-EWNI-2026-27'));

    expect(context.regimeLabel).toBe('UK England/Wales/NI 2026-27');
    expect(context.rulePackId).toBe('GB-EWNI-2026-27');
    expect(context.taxYear).toBe('2026-27');
    expect(context.lastCheckedDate).toBe('2026-05-05');
    expect(context.status).toBe('rule-pack');
    expect(context.statusLabel).toBe('Rule pack applied');
    expect(context.sources.map(source => source.url)).toContain('https://www.gov.uk/income-tax-rates');
    expect(context.knownExclusions).toContain('National Insurance, capital gains, inheritance tax, residency, and treaty rules are not modelled.');
  });

  it('flags a selected rule pack when user-configurable values have been edited', () => {
    const tax = taxConfigFromRulePack('GB-EWNI-2026-27');
    tax.personal_allowance = 10_000;

    const context = deriveTaxContext(tax);

    expect(context.status).toBe('modified-rule-pack');
    expect(context.statusLabel).toBe('Rule pack selected; calculation values edited');
  });

  it('returns explicit custom-config metadata without inventing official sources', () => {
    const tax: TaxConfig = {
      regime: 'Custom planning tax',
      personal_allowance: 12_570,
      bands: [{ name: 'Basic', width: null, rate: 0.2 }],
    };

    const context = deriveTaxContext(tax);

    expect(context.regimeLabel).toBe('Custom planning tax');
    expect(context.rulePackId).toBeNull();
    expect(context.taxYear).toBe('Not specified');
    expect(context.lastCheckedDate).toBe('Not recorded');
    expect(context.sources).toEqual([]);
    expect(context.status).toBe('custom');
    expect(context.knownExclusions).toContain('No official source URL is attached to this custom tax configuration.');
    expect(context.knownExclusions).toContain('Personal allowance taper above £100k is not modelled unless a taper is explicitly configured.');
  });
});
