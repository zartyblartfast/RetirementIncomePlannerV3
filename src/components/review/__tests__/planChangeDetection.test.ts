import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../store/configStore';
import type { PlannerConfig } from '../../../engine/types';
import { detectBaselinePlanChanges } from '../planChangeDetection';

function cloneConfig(): PlannerConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PlannerConfig;
}

describe('detectBaselinePlanChanges', () => {
  it('does not flag an unchanged current plan', () => {
    const baseline = cloneConfig();
    const current = cloneConfig();

    expect(detectBaselinePlanChanges(baseline, current)).toEqual({
      changed: false,
      changedLabels: [],
    });
  });

  it('flags drawdown strategy and TFC planning changes as baseline-relevant plan changes', () => {
    const baseline = cloneConfig();
    const current = cloneConfig();

    current.withdrawal_priority = ['ISA', 'Pension'];
    current.pension_access_events = [
      {
        id: 'new_tfc',
        event_type: 'tax_free_cash',
        pot_ref: current.dc_pots[0]!.name,
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 25000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    expect(detectBaselinePlanChanges(baseline, current)).toEqual({
      changed: true,
      changedLabels: ['withdrawal order', 'planned pension access/TFC'],
    });
  });

  it('ignores live value changes that Review already treats as current actuals', () => {
    const baseline = cloneConfig();
    const current = cloneConfig();

    current.dc_pots[0]!.starting_balance = baseline.dc_pots[0]!.starting_balance + 12345;
    current.tax.personal_allowance = baseline.tax.personal_allowance + 1000;
    current.guaranteed_income[0]!.gross_annual = baseline.guaranteed_income[0]!.gross_annual + 500;

    expect(detectBaselinePlanChanges(baseline, current)).toEqual({
      changed: false,
      changedLabels: [],
    });
  });
});
