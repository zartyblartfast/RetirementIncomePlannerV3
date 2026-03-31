import { describe, it, expect } from 'vitest';
import { calculateIomTax, calculateUkTax, grossUp } from '../tax';
import type { TaxConfig } from '../types';

const IOM_TAX: TaxConfig = {
  regime: 'Isle of Man',
  personal_allowance: 14500,
  bands: [
    { name: 'Lower rate', width: 6500, rate: 0.1 },
    { name: 'Higher rate', width: null, rate: 0.2 },
  ],
  tax_cap_enabled: false,
  tax_cap_amount: 200000,
};

describe('IoM Tax', () => {
  it('zero income → zero tax', () => {
    const r = calculateIomTax(0, IOM_TAX);
    expect(r.total).toBe(0);
    expect(r.marginal_rate).toBe(0);
  });

  it('income within personal allowance → zero tax', () => {
    const r = calculateIomTax(14000, IOM_TAX);
    expect(r.total).toBe(0);
  });

  it('income in lower band only', () => {
    // 14500 PA + 6500 lower = 21000 boundary
    const r = calculateIomTax(18000, IOM_TAX);
    // taxable after PA = 3500, all in 10% band
    expect(r.income_after_pa).toBe(3500);
    expect(r.total).toBe(350);
    expect(r.marginal_rate).toBe(0.1);
  });

  it('income crossing into higher band', () => {
    const r = calculateIomTax(25000, IOM_TAX);
    // after PA: 10500. 6500 at 10% = 650. 4000 at 20% = 800. total = 1450
    expect(r.income_after_pa).toBe(10500);
    expect(r.total).toBe(1450);
    expect(r.marginal_rate).toBe(0.2);
  });

  it('tax cap applied', () => {
    const cappedTax: TaxConfig = { ...IOM_TAX, tax_cap_enabled: true, tax_cap_amount: 500 };
    const r = calculateIomTax(25000, cappedTax);
    expect(r.total).toBe(500);
    expect(r.tax_cap_applied).toBe(true);
  });

  it('band details structure', () => {
    const r = calculateIomTax(25000, IOM_TAX);
    expect(r.bands.length).toBe(2);
    expect(r.bands[0]!.name).toBe('10%');
    expect(r.bands[0]!.taxable_in_band).toBe(6500);
    expect(r.bands[0]!.tax).toBe(650);
    expect(r.bands[1]!.name).toBe('20%');
    expect(r.bands[1]!.taxable_in_band).toBe(4000);
    expect(r.bands[1]!.tax).toBe(800);
  });
});

describe('UK Tax', () => {
  it('zero income → zero tax', () => {
    const r = calculateUkTax(0);
    expect(r.total).toBe(0);
  });

  it('income in basic rate only', () => {
    const r = calculateUkTax(30000);
    // after PA 12570: 17430 at 20% = 3486
    expect(r.income_after_pa).toBe(17430);
    expect(r.total).toBe(3486);
    expect(r.marginal_rate).toBe(0.2);
  });

  it('income in higher rate', () => {
    const r = calculateUkTax(60000);
    // after PA: 47430. 37700 at 20% = 7540. 9730 at 40% = 3892. total = 11432
    expect(r.income_after_pa).toBe(47430);
    expect(r.total).toBe(11432);
    expect(r.marginal_rate).toBe(0.4);
  });
});

describe('Gross-up', () => {
  it('gross-up with no existing taxable income', () => {
    const gross = grossUp(10000, 0, 0.25, IOM_TAX);
    // Should be > 10000 because of tax on the taxable 75%
    expect(gross).toBeGreaterThan(10000);
    expect(gross).toBeLessThan(15000);
  });

  it('gross-up converges within £0.50', () => {
    const gross = grossUp(5000, 20000, 0.25, IOM_TAX);
    // Verify: net from this gross should be ~5000
    const taxOnExisting = calculateIomTax(20000, IOM_TAX).total;
    const taxablePart = gross * 0.75;
    const totalTax = calculateIomTax(20000 + taxablePart, IOM_TAX).total;
    const netFromDc = gross - (totalTax - taxOnExisting);
    expect(Math.abs(netFromDc - 5000)).toBeLessThan(0.50);
  });

  it('zero net needed → zero gross', () => {
    expect(grossUp(0, 10000, 0.25, IOM_TAX)).toBe(0);
  });
});
