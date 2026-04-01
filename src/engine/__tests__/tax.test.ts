import { describe, it, expect } from 'vitest';
import { calculateTax, grossUp } from '../tax';
import type { TaxConfig } from '../types';

const TAX_CFG: TaxConfig = {
  regime: 'Custom',
  personal_allowance: 14500,
  bands: [
    { name: 'Lower rate', width: 6500, rate: 0.1 },
    { name: 'Higher rate', width: null, rate: 0.2 },
  ],
  tax_cap_enabled: false,
  tax_cap_amount: 200000,
};

describe('Banded Tax', () => {
  it('zero income → zero tax', () => {
    const r = calculateTax(0, TAX_CFG);
    expect(r.total).toBe(0);
    expect(r.marginal_rate).toBe(0);
  });

  it('income within personal allowance → zero tax', () => {
    const r = calculateTax(14000, TAX_CFG);
    expect(r.total).toBe(0);
  });

  it('income in lower band only', () => {
    // 14500 PA + 6500 lower = 21000 boundary
    const r = calculateTax(18000, TAX_CFG);
    // taxable after PA = 3500, all in 10% band
    expect(r.income_after_pa).toBe(3500);
    expect(r.total).toBe(350);
    expect(r.marginal_rate).toBe(0.1);
  });

  it('income crossing into higher band', () => {
    const r = calculateTax(25000, TAX_CFG);
    // after PA: 10500. 6500 at 10% = 650. 4000 at 20% = 800. total = 1450
    expect(r.income_after_pa).toBe(10500);
    expect(r.total).toBe(1450);
    expect(r.marginal_rate).toBe(0.2);
  });

  it('tax cap applied', () => {
    const cappedTax: TaxConfig = { ...TAX_CFG, tax_cap_enabled: true, tax_cap_amount: 500 };
    const r = calculateTax(25000, cappedTax);
    expect(r.total).toBe(500);
    expect(r.tax_cap_applied).toBe(true);
  });

  it('band details structure', () => {
    const r = calculateTax(25000, TAX_CFG);
    expect(r.bands.length).toBe(2);
    expect(r.bands[0]!.name).toBe('10%');
    expect(r.bands[0]!.taxable_in_band).toBe(6500);
    expect(r.bands[0]!.tax).toBe(650);
    expect(r.bands[1]!.name).toBe('20%');
    expect(r.bands[1]!.taxable_in_band).toBe(4000);
    expect(r.bands[1]!.tax).toBe(800);
  });
});

describe('UK-style Tax Config', () => {
  const UK_TAX: TaxConfig = {
    regime: 'UK',
    personal_allowance: 12570,
    bands: [
      { name: 'Basic', width: 37700, rate: 0.20 },
      { name: 'Higher', width: 74870, rate: 0.40 },
      { name: 'Additional', width: null, rate: 0.45 },
    ],
  };

  it('zero income → zero tax', () => {
    const r = calculateTax(0, UK_TAX);
    expect(r.total).toBe(0);
  });

  it('income in basic rate only', () => {
    const r = calculateTax(30000, UK_TAX);
    // after PA 12570: 17430 at 20% = 3486
    expect(r.income_after_pa).toBe(17430);
    expect(r.total).toBe(3486);
    expect(r.marginal_rate).toBe(0.2);
  });

  it('income in higher rate', () => {
    const r = calculateTax(60000, UK_TAX);
    // after PA: 47430. 37700 at 20% = 7540. 9730 at 40% = 3892. total = 11432
    expect(r.income_after_pa).toBe(47430);
    expect(r.total).toBe(11432);
    expect(r.marginal_rate).toBe(0.4);
  });
});

describe('Gross-up', () => {
  it('gross-up with no existing taxable income', () => {
    const gross = grossUp(10000, 0, 0.25, TAX_CFG);
    // Should be > 10000 because of tax on the taxable 75%
    expect(gross).toBeGreaterThan(10000);
    expect(gross).toBeLessThan(15000);
  });

  it('gross-up converges within £0.50', () => {
    const gross = grossUp(5000, 20000, 0.25, TAX_CFG);
    // Verify: net from this gross should be ~5000
    const taxOnExisting = calculateTax(20000, TAX_CFG).total;
    const taxablePart = gross * 0.75;
    const totalTax = calculateTax(20000 + taxablePart, TAX_CFG).total;
    const netFromDc = gross - (totalTax - taxOnExisting);
    expect(Math.abs(netFromDc - 5000)).toBeLessThan(0.50);
  });

  it('zero net needed → zero gross', () => {
    expect(grossUp(0, 10000, 0.25, TAX_CFG)).toBe(0);
  });
});
