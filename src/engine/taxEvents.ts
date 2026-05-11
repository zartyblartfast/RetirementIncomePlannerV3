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

export interface AnnualTaxEventInput {
  tax_year: string;
  age: number;
  guaranteed_gross: number;
  guaranteed_taxable: number;
  dc_gross: number;
  dc_tax_free: number;
  tf_withdrawal: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function yearRowToTaxEvents(year: YearRow): TaxEvent[] {
  return annualTaxEventsFromAmounts({
    tax_year: year.tax_year,
    age: year.age,
    guaranteed_gross: year.guaranteed_total,
    guaranteed_taxable: Math.max(0, year.total_taxable_income - Math.max(0, year.dc_withdrawal_gross - year.dc_tax_free_portion)),
    dc_gross: year.dc_withdrawal_gross,
    dc_tax_free: year.dc_tax_free_portion,
    tf_withdrawal: year.tf_withdrawal,
  });
}

export function annualTaxEventsFromAmounts(input: AnnualTaxEventInput): TaxEvent[] {
  const events: TaxEvent[] = [];
  const dcTaxableAmount = round2(Math.max(0, input.dc_gross - input.dc_tax_free));
  const totalTaxableAmount = round2(Math.max(0, input.guaranteed_taxable + Math.max(0, input.dc_gross - input.dc_tax_free)));
  const guaranteedTaxableAmount = round2(Math.max(0, totalTaxableAmount - dcTaxableAmount));

  if (input.guaranteed_gross > 0 || guaranteedTaxableAmount > 0) {
    events.push({
      tax_year: input.tax_year,
      age: input.age,
      category: 'guaranteed_income',
      source: 'Guaranteed income',
      gross_amount: round2(input.guaranteed_gross),
      taxable_amount: guaranteedTaxableAmount,
    });
  }

  if (dcTaxableAmount > 0) {
    events.push({
      tax_year: input.tax_year,
      age: input.age,
      category: 'dc_pension_taxable',
      source: 'DC pension drawdown',
      gross_amount: dcTaxableAmount,
      taxable_amount: dcTaxableAmount,
    });
  }

  if (input.dc_tax_free > 0) {
    events.push({
      tax_year: input.tax_year,
      age: input.age,
      category: 'dc_pension_tax_free',
      source: 'DC pension tax-free portion',
      gross_amount: round2(input.dc_tax_free),
      taxable_amount: 0,
    });
  }

  if (input.tf_withdrawal > 0) {
    events.push({
      tax_year: input.tax_year,
      age: input.age,
      category: 'tax_free_account_withdrawal',
      source: 'Tax-free account withdrawal',
      gross_amount: round2(input.tf_withdrawal),
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
