import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../store/configStore';
import type { PlannerConfig, ProjectionResult, YearRow } from '../types';
import { runProjection } from '../projection';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function comparableYears(result: ProjectionResult): Array<Pick<YearRow,
  | 'age'
  | 'tax_year'
  | 'target_net'
  | 'dc_withdrawal_gross'
  | 'dc_tax_free_portion'
  | 'tf_withdrawal'
  | 'total_taxable_income'
  | 'tax_due'
  | 'net_income_achieved'
  | 'total_capital'
>> {
  return result.years.map(year => ({
    age: year.age,
    tax_year: year.tax_year,
    target_net: year.target_net,
    dc_withdrawal_gross: year.dc_withdrawal_gross,
    dc_tax_free_portion: year.dc_tax_free_portion,
    tf_withdrawal: year.tf_withdrawal,
    total_taxable_income: year.total_taxable_income,
    tax_due: year.tax_due,
    net_income_achieved: year.net_income_achieved,
    total_capital: year.total_capital,
  }));
}

describe('projection pension ledger foundation', () => {
  it('returns end-of-projection ledger states seeded from projection balances for simplified pro-rata pots', () => {
    const result = runProjection(cloneConfig(DEFAULT_CONFIG));
    const ledger = result.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension');

    expect(ledger).toEqual(expect.objectContaining({
      pot_ref: 'DC Pension',
      pot_name: 'DC Pension',
      crystallised_drawdown_balance: 0,
      lsa_tracking_status: 'not_modelled',
      mpaa_triggered: false,
    }));
    expect(ledger!.uncrystallised_balance).toBeCloseTo(result.summary.remaining_pots['DC Pension']!, 2);
    expect(result.pension_ledger_summary).toEqual(expect.objectContaining({
      lsa_tracking_status: 'not_modelled',
      mpaa_triggered: false,
    }));
  });

  it('keeps simplified pro-rata YearRow income, tax, and capital outputs unchanged while carrying the ledger side channel', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    const result = runProjection(cfg);

    expect(comparableYears(result)).toEqual(comparableYears(runProjection(cloneConfig(DEFAULT_CONFIG))));
    expect(result.pension_ledger_states).toHaveLength(cfg.dc_pots.length);
  });

  it('reflects compatibility tax-free-cash capital events in the ledger without treating them as legal PCLS/UFPLS', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.pension_access_events = [
      {
        id: 'retirement_tfc',
        pot_ref: 'DC Pension',
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 10_000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const result = runProjection(cfg);
    const baseline = runProjection(cloneConfig(DEFAULT_CONFIG));
    const eventYear = result.years.find(year => year.pension_access_events?.some(event => event.id === 'retirement_tfc'))!;
    const ledger = result.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension')!;

    expect(eventYear.pension_access_events![0]).toEqual(expect.objectContaining({
      gross_amount: 10_000,
      tax_free_amount: 10_000,
      taxable_amount: 0,
      caveats: ['simplified_tfc_event_no_lsa_lsdba_tracking'],
    }));
    expect(ledger.tax_free_cash_taken).toBeCloseTo(10_000, 2);
    expect(ledger.uncrystallised_balance).toBeCloseTo(result.summary.remaining_pots['DC Pension']!, 2);
    expect(ledger.mpaa_triggered).toBe(false);
    expect(ledger.lsa_tracking_status).toBe('not_modelled');
    expect(ledger.lsa_used).toBeUndefined();
    expect(eventYear.dc_withdrawal_gross).toBeCloseTo(
      baseline.years.find(year => year.tax_year === eventYear.tax_year)!.dc_withdrawal_gross,
      2,
    );
    expect(eventYear.total_taxable_income).toBeCloseTo(
      baseline.years.find(year => year.tax_year === eventYear.tax_year)!.total_taxable_income,
      2,
    );
  });
});
