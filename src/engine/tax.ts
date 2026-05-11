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

function resolvePersonalAllowance(taxableIncome: number, taxCfg: TaxConfig): number {
  const taper = taxCfg.personal_allowance_taper;
  if (!taper || taxableIncome <= taper.starts_at) {
    return taxCfg.personal_allowance;
  }

  const minimum = taper.minimum_allowance ?? 0;
  const reduction = (taxableIncome - taper.starts_at) * taper.rate;
  return Math.max(minimum, taxCfg.personal_allowance - reduction);
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
//  Tax module interface
// ------------------------------------------------------------------ //

export interface TaxCalculationInput {
  taxableIncome: number;
  taxConfig: TaxConfig;
}

export interface TaxRuleModule {
  id: string;
  label: string;
  supports(taxCfg: TaxConfig): boolean;
  calculate(input: TaxCalculationInput): TaxResult;
}

export const simpleBandedTaxModule: TaxRuleModule = {
  id: 'simple-banded',
  label: 'Simple banded income tax',
  supports: taxCfg => Array.isArray(taxCfg.bands),
  calculate: ({ taxableIncome, taxConfig }) => {
    const bands: BandInput[] = taxConfig.bands.map(b => ({
      name: `${Math.round(b.rate * 100)}%`,
      width: b.width,
      rate: b.rate,
    }));

    return calculateBandedTax(
      taxableIncome,
      resolvePersonalAllowance(taxableIncome, taxConfig),
      bands,
      taxConfig.tax_cap_enabled ?? false,
      taxConfig.tax_cap_amount ?? 200000,
    );
  },
};

const FIRST_PARTY_TAX_MODULES: TaxRuleModule[] = [simpleBandedTaxModule];

export function getTaxRuleModule(taxCfg: TaxConfig): TaxRuleModule {
  const explicitModule = taxCfg.tax_module_id
    ? FIRST_PARTY_TAX_MODULES.find(candidate => candidate.id === taxCfg.tax_module_id)
    : undefined;
  if (taxCfg.tax_module_id && !explicitModule) {
    throw new Error(`Unknown tax module: ${taxCfg.tax_module_id}`);
  }

  const module = explicitModule ?? FIRST_PARTY_TAX_MODULES.find(candidate => candidate.supports(taxCfg));
  if (!module) {
    throw new Error(`No tax rule module supports regime: ${taxCfg.regime}`);
  }
  return module;
}

export function calculateTaxWithModule(
  taxableIncome: number,
  taxCfg: TaxConfig,
  taxModule: TaxRuleModule = getTaxRuleModule(taxCfg),
): TaxResult {
  if (!taxModule.supports(taxCfg)) {
    throw new Error(`Tax module ${taxModule.id} does not support regime: ${taxCfg.regime}`);
  }

  return taxModule.calculate({ taxableIncome, taxConfig: taxCfg });
}

// ------------------------------------------------------------------ //
//  Tax calculation (user-configured regime)
// ------------------------------------------------------------------ //

export function calculateTax(taxableIncome: number, taxCfg: TaxConfig): TaxResult {
  return calculateTaxWithModule(taxableIncome, taxCfg);
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
