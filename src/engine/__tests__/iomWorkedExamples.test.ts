import { describe, expect, it } from 'vitest';
import { calculateTax } from '../tax';
import { taxConfigFromRulePack } from '../taxRulePacks';

describe('Isle of Man 2026-27 worked examples', () => {
  const tax = taxConfigFromRulePack('IM-2026-27');

  it('keeps income below the personal allowance tax-free', () => {
    // 16000 income - 17000 PA = 0 taxable income after PA.
    const result = calculateTax(16_000, tax);

    expect(result.personal_allowance).toBe(17_000);
    expect(result.income_after_pa).toBe(0);
    expect(result.total).toBe(0);
    expect(result.marginal_rate).toBe(0);
    expect(result.tax_cap_applied).toBe(false);
  });

  it('taxes standard-rate-band-only income at 10%', () => {
    // 20000 income - 17000 PA = 3000.
    // 3000 at 10% = 300.
    const result = calculateTax(20_000, tax);

    expect(result.personal_allowance).toBe(17_000);
    expect(result.income_after_pa).toBe(3_000);
    expect(result.total).toBe(300);
    expect(result.marginal_rate).toBe(0.10);
    expect(result.tax_cap_applied).toBe(false);
  });

  it('taxes income crossing into the higher-rate band', () => {
    // 50000 income - 17000 PA = 33000.
    // 6500 at 10% = 650.
    // 26500 at 21% = 5565.
    // Total = 6215.
    const result = calculateTax(50_000, tax);

    expect(result.personal_allowance).toBe(17_000);
    expect(result.income_after_pa).toBe(33_000);
    expect(result.total).toBe(6_215);
    expect(result.marginal_rate).toBe(0.21);
    expect(result.tax_cap_applied).toBe(false);
  });

  it('applies the personal allowance taper above 100000', () => {
    // 110000 income tapers PA by (110000 - 100000) * 50% = 5000.
    // PA = 17000 - 5000 = 12000.
    // Income after PA = 98000.
    // 6500 at 10% = 650.
    // 91500 at 21% = 19215.
    // Total = 19865.
    const result = calculateTax(110_000, tax);

    expect(result.personal_allowance).toBe(12_000);
    expect(result.income_after_pa).toBe(98_000);
    expect(result.total).toBe(19_865);
    expect(result.marginal_rate).toBe(0.21);
    expect(result.tax_cap_applied).toBe(false);
  });

  it('caps tax when the optional tax cap is explicitly enabled', () => {
    const cappedTax = { ...tax, tax_cap_enabled: true, tax_cap_amount: 220_000 };

    // 1100000 income fully tapers the PA to 0.
    // 6500 at 10% = 650.
    // 1093500 at 21% = 229635.
    // Uncapped total = 230285, capped to 220000.
    const result = calculateTax(1_100_000, cappedTax);

    expect(result.personal_allowance).toBe(0);
    expect(result.income_after_pa).toBe(1_100_000);
    expect(result.total).toBe(220_000);
    expect(result.marginal_rate).toBe(0.21);
    expect(result.tax_cap_applied).toBe(true);
  });
});
