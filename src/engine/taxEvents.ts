import type { YearRow } from './types';

export type TaxEventCategory =
  | 'guaranteed_income'
  | 'dc_pension_taxable'
  | 'dc_pension_tax_free'
  | 'tax_free_account_withdrawal';

export interface TaxEvent {
  tax_year: string;
  age: number;
  category: TaxEventCategory;
  source: string;
  gross_amount: number;
  taxable_amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function yearRowToTaxEvents(year: YearRow): TaxEvent[] {
  const events: TaxEvent[] = [];
  const dcTaxableAmount = round2(Math.max(0, year.dc_withdrawal_gross - year.dc_tax_free_portion));
  const guaranteedTaxableAmount = round2(Math.max(0, year.total_taxable_income - dcTaxableAmount));

  if (year.guaranteed_total > 0 || guaranteedTaxableAmount > 0) {
    events.push({
      tax_year: year.tax_year,
      age: year.age,
      category: 'guaranteed_income',
      source: 'Guaranteed income',
      gross_amount: round2(year.guaranteed_total),
      taxable_amount: guaranteedTaxableAmount,
    });
  }

  if (dcTaxableAmount > 0) {
    events.push({
      tax_year: year.tax_year,
      age: year.age,
      category: 'dc_pension_taxable',
      source: 'DC pension drawdown',
      gross_amount: dcTaxableAmount,
      taxable_amount: dcTaxableAmount,
    });
  }

  if (year.dc_tax_free_portion > 0) {
    events.push({
      tax_year: year.tax_year,
      age: year.age,
      category: 'dc_pension_tax_free',
      source: 'DC pension tax-free portion',
      gross_amount: round2(year.dc_tax_free_portion),
      taxable_amount: 0,
    });
  }

  if (year.tf_withdrawal > 0) {
    events.push({
      tax_year: year.tax_year,
      age: year.age,
      category: 'tax_free_account_withdrawal',
      source: 'Tax-free account withdrawal',
      gross_amount: round2(year.tf_withdrawal),
      taxable_amount: 0,
    });
  }

  return events;
}

export function totalTaxableFromEvents(events: TaxEvent[]): number {
  return round2(events.reduce((sum, event) => sum + event.taxable_amount, 0));
}

export function totalGrossFromEvents(events: TaxEvent[]): number {
  return round2(events.reduce((sum, event) => sum + event.gross_amount, 0));
}
