import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../store/configStore';
import { runProjection } from '../projection';
import type { PensionAccessEventConfig, PlannerConfig } from '../types';
import {
  normalizeConfigPensionAccessEvents,
  resolvePensionAccessEvents,
  validatePensionAccessEvents,
} from '../pensionAccessEvents';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function event(overrides: Partial<PensionAccessEventConfig> = {}): PensionAccessEventConfig {
  return {
    id: 'event_1',
    pot_ref: 'DC Pension',
    event_type: 'tax_free_cash',
    timing: { kind: 'date', date: '2032-01' },
    amount: { kind: 'fixed_amount', value: 10000 },
    destination: { kind: 'outside_plan' },
    ...overrides,
  };
}

describe('pension access event config foundation', () => {
  it('does not create accidental pension access events for existing configs', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    delete cfg.pension_access_events;

    const normalized = normalizeConfigPensionAccessEvents(cfg);

    expect(normalized.pension_access_events).toBeUndefined();
  });

  it('preserves valid event-led config without changing current pot tax-free cash metadata', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.pension_access_events = [event({ notes: 'Take planned tax-free cash separately' })];

    const normalized = normalizeConfigPensionAccessEvents(cfg);

    expect(normalized.pension_access_events).toEqual(cfg.pension_access_events);
    expect(normalized.dc_pots[0]!.tax_free_cash).toEqual({
      mode: 'gradual_pro_rata',
      residual_mode: 'gradual_pro_rata',
    });
  });

  it('reports duplicate event IDs and missing pot references deterministically', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.pension_access_events = [
      event({ id: 'planned_tfc' }),
      event({ id: 'planned_tfc', pot_ref: 'Old SIPP name' }),
    ];

    expect(validatePensionAccessEvents(cfg)).toEqual([
      {
        code: 'duplicate_event_id',
        event_id: 'planned_tfc',
        message: 'Pension access event planned_tfc uses a duplicate event ID.',
      },
      {
        code: 'missing_pot_ref',
        event_id: 'planned_tfc',
        pot_ref: 'Old SIPP name',
        message: 'Pension access event planned_tfc references Old SIPP name, but that pension pot was not found.',
      },
    ]);
  });

  it('validates percentage bases and in-plan destinations before projection logic exists', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.pension_access_events = [
      event({
        id: 'too_much_percentage',
        amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1.25 },
      }),
      event({
        id: 'missing_destination_target',
        destination: { kind: 'tax_free_account' },
      }),
    ];

    expect(validatePensionAccessEvents(cfg)).toEqual([
      {
        code: 'invalid_percentage_amount',
        event_id: 'too_much_percentage',
        message: 'Pension access event too_much_percentage must use a percentage between 0% and 100%.',
      },
      {
        code: 'missing_destination_target',
        event_id: 'missing_destination_target',
        message: 'Pension access event missing_destination_target sends cash inside the plan but does not name a destination account.',
      },
    ]);
  });

  it('resolves configured event timing into deterministic projection months without applying cashflow effects', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.pension_access_events = [
      event({ id: 'at_retirement', timing: { kind: 'retirement_date' } }),
      event({ id: 'by_age', timing: { kind: 'age', age: 68 } }),
      event({ id: 'dated', timing: { kind: 'date', date: '2033-06' } }),
    ];

    expect(resolvePensionAccessEvents(cfg)).toEqual([
      expect.objectContaining({
        id: 'at_retirement',
        pot_ref: 'DC Pension',
        pot_name: 'DC Pension',
        projection_year: '2032',
        month: 1,
        order_in_month: 0,
        event_type: 'tax_free_cash',
        gross_amount: 10000,
        tax_free_amount: 0,
        taxable_amount: 0,
        caveats: ['foundation_only_not_applied'],
      }),
      expect.objectContaining({
        id: 'by_age',
        projection_year: '2033',
        month: 1,
        order_in_month: 0,
        gross_amount: 10000,
      }),
      expect.objectContaining({
        id: 'dated',
        projection_year: '2033',
        month: 6,
        order_in_month: 0,
        gross_amount: 10000,
      }),
    ]);
  });

  it('applies resolved tax-free cash events as separate capital events', () => {
    const withEvents = cloneConfig(DEFAULT_CONFIG);
    withEvents.pension_access_events = [
      event({ id: 'future_tfc', timing: { kind: 'retirement_date' } }),
      event({ id: 'same_month_second', timing: { kind: 'retirement_date' }, amount: { kind: 'percentage_of_pot', value: 0.1 } }),
    ];

    const result = runProjection(withEvents);

    expect(result.pension_access_events![0]).toEqual(expect.objectContaining({
      id: 'future_tfc',
      projection_year: '2032',
      month: 1,
      order_in_month: 0,
      gross_amount: 10000,
      tax_free_amount: 10000,
      taxable_amount: 0,
    }));
    expect(result.pension_access_events![0]!.caveats).toEqual(expect.arrayContaining([
      'ordinary_drawdown_also_targets_this_pot',
      'simplified_tfc_event_no_lsa_lsdba_tracking',
    ]));
    expect(result.pension_access_events![1]).toEqual(expect.objectContaining({
      id: 'same_month_second',
      projection_year: '2032',
      month: 1,
      order_in_month: 1,
      taxable_amount: 0,
    }));
    expect(result.pension_access_events![1]!.caveats).toEqual(expect.arrayContaining([
      'ordinary_drawdown_also_targets_this_pot',
      'simplified_tfc_event_no_lsa_lsdba_tracking',
    ]));
    expect(result.pension_access_events![1]!.gross_amount)
      .toBeCloseTo(result.pension_access_events![1]!.pot_balance_before * 0.1, 2);
    expect(result.pension_access_events![1]!.tax_free_amount)
      .toBeCloseTo(result.pension_access_events![1]!.gross_amount, 2);
    expect(result.pension_access_events![0]!.pot_balance_after)
      .toBeCloseTo(result.pension_access_events![0]!.pot_balance_before - 10000, 2);
    expect(result.pension_access_events![1]!.pot_balance_after)
      .toBeCloseTo(
        result.pension_access_events![1]!.pot_balance_before - result.pension_access_events![1]!.gross_amount,
        2,
      );
  });

  it('groups resolved pension access events onto the matching projection year for workings display', () => {
    const withEvents = cloneConfig(DEFAULT_CONFIG);
    withEvents.pension_access_events = [
      event({ id: 'retirement_tfc', timing: { kind: 'retirement_date' } }),
      event({ id: 'later_tfc', timing: { kind: 'age', age: 68 } }),
    ];

    const result = runProjection(withEvents);
    const retirementYear = result.years.find(year => year.tax_year === '2032/33');
    const laterYear = result.years.find(year => year.tax_year === '2033/34');

    expect(retirementYear?.pension_access_events).toHaveLength(1);
    expect(retirementYear?.pension_access_events?.[0]).toEqual(
      expect.objectContaining({
        id: 'retirement_tfc',
        projection_year: '2032',
        month: 1,
        gross_amount: 10000,
      }),
    );
    expect(retirementYear?.pension_access_events?.[0]?.caveats).toEqual(expect.arrayContaining([
      'ordinary_drawdown_also_targets_this_pot',
      'simplified_tfc_event_no_lsa_lsdba_tracking',
    ]));
    expect(laterYear?.pension_access_events).toHaveLength(1);
    expect(laterYear?.pension_access_events?.[0]).toEqual(
      expect.objectContaining({
        id: 'later_tfc',
        projection_year: '2033',
        month: 1,
        gross_amount: 10000,
      }),
    );
    expect(laterYear?.pension_access_events?.[0]?.caveats).toEqual(expect.arrayContaining([
      'ordinary_drawdown_also_targets_this_pot',
      'simplified_tfc_event_no_lsa_lsdba_tracking',
    ]));
  });

  it('does not treat applied tax-free cash events as income or taxable drawdown', () => {
    const baseline = cloneConfig(DEFAULT_CONFIG);
    const withEvents = cloneConfig(DEFAULT_CONFIG);
    withEvents.pension_access_events = [event({ id: 'future_tfc', timing: { kind: 'retirement_date' } })];

    const baselineResult = runProjection(baseline);
    const result = runProjection(withEvents);
    const baselineYear = baselineResult.years.find(year => year.tax_year === '2032/33')!;
    const eventYear = result.years.find(year => year.tax_year === '2032/33')!;

    expect(eventYear.pension_access_events![0]).toEqual(expect.objectContaining({
      id: 'future_tfc',
      gross_amount: 10000,
      tax_free_amount: 10000,
      taxable_amount: 0,
    }));
    expect(eventYear.dc_withdrawal_gross).toBeCloseTo(baselineYear.dc_withdrawal_gross, 2);
    expect(eventYear.dc_tax_free_portion).toBeCloseTo(baselineYear.dc_tax_free_portion, 2);
    expect(eventYear.total_taxable_income).toBeCloseTo(baselineYear.total_taxable_income, 2);
    expect(eventYear.tax_due).toBeCloseTo(baselineYear.tax_due, 2);
    expect(eventYear.net_income_achieved).toBeCloseTo(baselineYear.net_income_achieved, 2);
    expect(eventYear.pot_pnl['DC Pension']!.withdrawal).toBeCloseTo(
      baselineYear.pot_pnl['DC Pension']!.withdrawal + 10000,
      2,
    );
  });
});
