/**
 * Tax calculation module — generic banded tax calculator.
 *
 * Supports any tax regime defined by personal allowance + bands.
 */

import type { TaxConfig, TaxResult, TaxBandDetail } from './types';

// ------------------------------------------------------------------ //
//  Generic banded tax calculator
// ------------------------------------------------------------------ //

interface BandInput {
  name: string;
  width: number | null;
  rate: number;
}

function calculateBandedTax(
  taxableIncome: number,
  personalAllowance: number,
  bands: BandInput[],
  taxCapEnabled: boolean = false,
  taxCapAmount: number = 200000,
): TaxResult {
  const incomeAfterPa = Math.max(0, taxableIncome - personalAllowance);
  let tax = 0;
  let remaining = incomeAfterPa;
  const bandDetails: TaxBandDetail[] = [];
  let marginalRate = 0;

  for (const band of bands) {
    const { width, rate, name } = band;

    if (width === null) {
      // Unlimited top band
      const taxableInBand = remaining;
      const bandTax = remaining * rate;
      tax += bandTax;
      bandDetails.push({
        name,
        rate,
        width: 'remainder',
        taxable_in_band: round2(taxableInBand),
        tax: round2(bandTax),
      });
      if (taxableInBand > 0) marginalRate = rate;
      remaining = 0;
    } else {
      const taxableInBand = Math.min(remaining, width);
      const bandTax = taxableInBand * rate;
      tax += bandTax;
      bandDetails.push({
        name,
        rate,
        width,
        taxable_in_band: round2(taxableInBand),
        tax: round2(bandTax),
      });
      if (taxableInBand > 0) marginalRate = rate;
      remaining -= taxableInBand;
    }

    if (remaining <= 0) break;
  }

  let taxCapApplied = false;
  if (taxCapEnabled && tax > taxCapAmount) {
    tax = taxCapAmount;
    taxCapApplied = true;
  }

  return {
    total: round2(tax),
    taxable_income: round2(taxableIncome),
    personal_allowance: personalAllowance,
    income_after_pa: round2(incomeAfterPa),
    bands: bandDetails,
    marginal_rate: marginalRate,
    tax_cap_applied: taxCapApplied,
  };
}

// ------------------------------------------------------------------ //
//  Tax calculation (user-configured regime)
// ------------------------------------------------------------------ //

export function calculateTax(taxableIncome: number, taxCfg: TaxConfig): TaxResult {
  const bands: BandInput[] = taxCfg.bands.map(b => ({
    name: `${Math.round(b.rate * 100)}%`,
    width: b.width,
    rate: b.rate,
  }));

  return calculateBandedTax(
    taxableIncome,
    taxCfg.personal_allowance,
    bands,
    taxCfg.tax_cap_enabled ?? false,
    taxCfg.tax_cap_amount ?? 200000,
  );
}

// ------------------------------------------------------------------ //
//  Gross-up solver (binary search)
// ------------------------------------------------------------------ //

export function grossUp(
  netNeeded: number,
  guaranteedTaxable: number,
  taxFreePortion: number,
  taxCfg: TaxConfig,
): number {
  if (netNeeded <= 0) return 0;

  const taxOnExisting = calculateTax(guaranteedTaxable, taxCfg).total;
  let lo = netNeeded;
  let hi = netNeeded * 3;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const taxablePart = mid * (1 - taxFreePortion);
    const totalTaxable = guaranteedTaxable + taxablePart;
    const totalTax = calculateTax(totalTaxable, taxCfg).total;
    const marginalTax = totalTax - taxOnExisting;
    const netFromDc = mid - marginalTax;

    if (Math.abs(netFromDc - netNeeded) < 0.50) {
      return round2(mid);
    }
    if (netFromDc < netNeeded) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return round2((lo + hi) / 2);
}

/**
 * Monthly gross-up using annualised taxable base (PAYE-like).
 * Identical logic to grossUp but with 60 iterations.
 */
export function monthlyGrossUp(
  netNeeded: number,
  taxableBase: number,
  taxFreePortion: number,
  taxCfg: TaxConfig,
): number {
  if (netNeeded <= 0) return 0;

  const taxOnExisting = calculateTax(taxableBase, taxCfg).total;
  let lo = netNeeded;
  let hi = netNeeded * 3;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const taxablePart = mid * (1 - taxFreePortion);
    const totalTax = calculateTax(taxableBase + taxablePart, taxCfg).total;
    const marginalTax = totalTax - taxOnExisting;
    const netFromDc = mid - marginalTax;

    if (Math.abs(netFromDc - netNeeded) < 0.50) {
      return round2(mid);
    }
    if (netFromDc < netNeeded) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return round2((lo + hi) / 2);
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
