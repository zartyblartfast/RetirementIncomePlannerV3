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

  function pensionOnlyConfig(): PlannerConfig {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.personal.end_age = 68;
    cfg.target_income.net_annual = 0;
    cfg.guaranteed_income = [];
    cfg.tax_free_accounts = [];
    cfg.dc_pots = [{
      ...cfg.dc_pots[0]!,
      name: 'DC Pension',
      starting_balance: 100_000,
      growth_rate: 0,
      annual_fees: 0,
      values_as_of: cfg.personal.retirement_date,
    }];
    cfg.withdrawal_priority = ['DC Pension'];
    cfg.drawdown_stages = [{
      id: 'stage_1',
      name: 'Pension only',
      sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
    }];
    return cfg;
  }

  it('applies explicit crystallise-and-take-PCLS events as tax-free capital events without ordinary income or MPAA side effects', () => {
    const cfg = pensionOnlyConfig();
    cfg.pension_access_events = [
      {
        id: 'annual_pcls_1',
        pot_ref: 'DC Pension',
        event_type: 'crystallise_and_take_pcls',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 40_000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const result = runProjection(cfg);
    const eventYear = result.years.find(year => year.pension_access_events?.some(event => event.id === 'annual_pcls_1'))!;
    const event = eventYear.pension_access_events![0]!;
    const ledger = result.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension')!;

    expect(event).toEqual(expect.objectContaining({
      event_type: 'crystallise_and_take_pcls',
      gross_amount: 40_000,
      tax_free_amount: 10_000,
      taxable_amount: 0,
      pot_balance_before: 100_000,
      pot_balance_after: 90_000,
    }));
    expect(event.caveats).toContain('pcls_above_lsa_headroom_not_modelled');
    expect(eventYear.pot_pnl['DC Pension']!.withdrawal).toBeCloseTo(10_000, 2);
    expect(eventYear.dc_withdrawal_gross).toBe(0);
    expect(eventYear.dc_tax_free_portion).toBe(0);
    expect(eventYear.total_taxable_income).toBe(0);
    expect(eventYear.tax_due).toBe(0);
    expect(eventYear.net_income_achieved).toBe(0);
    expect(ledger.uncrystallised_balance).toBeCloseTo(60_000, 2);
    expect(ledger.crystallised_drawdown_balance).toBeCloseTo(30_000, 2);
    expect(ledger.tax_free_cash_taken).toBeCloseTo(10_000, 2);
    expect(ledger.mpaa_triggered).toBe(false);
    expect(result.summary.remaining_pots['DC Pension']).toBeCloseTo(90_000, 2);
  });

  it('attributes later pot growth proportionally across uncrystallised and crystallised ledger balances', () => {
    const cfg = pensionOnlyConfig();
    cfg.dc_pots[0]!.growth_rate = 0.12;
    cfg.pension_access_events = [
      {
        id: 'annual_pcls_1',
        pot_ref: 'DC Pension',
        event_type: 'crystallise_and_take_pcls',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 40_000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const result = runProjection(cfg);
    const ledger = result.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension')!;
    const remainingPot = result.summary.remaining_pots['DC Pension']!;

    expect(ledger.crystallised_drawdown_balance).toBeGreaterThan(30_000);
    expect(ledger.uncrystallised_balance).toBeGreaterThan(60_000);
    expect(ledger.uncrystallised_balance + ledger.crystallised_drawdown_balance).toBeCloseTo(remainingPot, 2);
  });

  it('applies same-month taxable flexi-access drawdown from crystallised balance as taxable income and triggers MPAA', () => {
    const cfg = pensionOnlyConfig();
    cfg.pension_access_events = [
      {
        id: 'annual_pcls_1',
        pot_ref: 'DC Pension',
        event_type: 'crystallise_and_take_pcls',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 40_000 },
        destination: { kind: 'outside_plan' },
      },
      {
        id: 'taxable_fad_1',
        pot_ref: 'DC Pension',
        event_type: 'taxable_flexi_access_drawdown',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 20_000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const result = runProjection(cfg);
    const eventYear = result.years.find(year => year.pension_access_events?.some(event => event.id === 'taxable_fad_1'))!;
    const [pclsEvent, fadEvent] = eventYear.pension_access_events!;
    const ledger = result.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension')!;

    expect(pclsEvent).toEqual(expect.objectContaining({
      id: 'annual_pcls_1',
      event_type: 'crystallise_and_take_pcls',
      gross_amount: 40_000,
      tax_free_amount: 10_000,
      taxable_amount: 0,
    }));
    expect(fadEvent).toEqual(expect.objectContaining({
      id: 'taxable_fad_1',
      event_type: 'taxable_flexi_access_drawdown',
      gross_amount: 20_000,
      tax_free_amount: 0,
      taxable_amount: 20_000,
      pot_balance_before: 90_000,
      pot_balance_after: 70_000,
    }));
    expect(fadEvent!.caveats).toContain('mpaa_triggered_by_taxable_drawdown');
    expect(eventYear.pot_pnl['DC Pension']!.withdrawal).toBeCloseTo(30_000, 2);
    expect(eventYear.dc_withdrawal_gross).toBeCloseTo(20_000, 2);
    expect(eventYear.dc_tax_free_portion).toBeCloseTo(0, 2);
    expect(eventYear.total_taxable_income).toBeCloseTo(20_000, 2);
    expect(eventYear.tax_due).toBeCloseTo(1_486, 2);
    expect(eventYear.net_income_achieved).toBeCloseTo(18_514, 2);
    expect(ledger.uncrystallised_balance).toBeCloseTo(60_000, 2);
    expect(ledger.crystallised_drawdown_balance).toBeCloseTo(10_000, 2);
    expect(ledger.tax_free_cash_taken).toBeCloseTo(10_000, 2);
    expect(ledger.taxable_drawdown_taken).toBeCloseTo(20_000, 2);
    expect(ledger.mpaa_triggered).toBe(true);
    expect(ledger.mpaa_trigger_date).toBe('2032-01');
    expect(result.summary.remaining_pots['DC Pension']).toBeCloseTo(70_000, 2);
  });
});
