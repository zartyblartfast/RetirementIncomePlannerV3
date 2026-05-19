import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../store/configStore';
import type { PlannerConfig } from '../../../engine/types';
import { applySandboxStrategySettingsToCurrentPlan } from '../applySandboxToCurrentPlan';

function cloneConfig(): PlannerConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PlannerConfig;
}

describe('applySandboxStrategySettingsToCurrentPlan', () => {
  it('copies only drawdown strategy and planned pension-access settings into the current plan', () => {
    const current = cloneConfig();
    const sandbox = cloneConfig();

    current.dc_pots[0]!.starting_balance = 250000;
    current.dc_pots[0]!.growth_rate = 0.03;
    current.tax.personal_allowance = 17000;
    current.guaranteed_income[0]!.gross_annual = 12000;
    current.personal.retirement_date = '2035-04';

    sandbox.dc_pots[0]!.starting_balance = 999999;
    sandbox.dc_pots[0]!.growth_rate = 0.09;
    sandbox.tax.personal_allowance = 99999;
    sandbox.guaranteed_income[0]!.gross_annual = 99999;
    sandbox.personal.retirement_date = '2040-04';

    sandbox.drawdown_strategy = 'fixed_target';
    sandbox.drawdown_strategy_params = { net_annual: 36000 };
    sandbox.target_income = { ...sandbox.target_income, net_annual: 36000, cpi_rate: 0.025 };
    sandbox.withdrawal_priority = ['ISA', 'Pension'];
    sandbox.drawdown_stages = [
      {
        id: 'sandbox_stage_1',
        name: 'Sandbox ISA first',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
    ];
    sandbox.pension_access_events = [
      {
        id: 'sandbox_retirement_tfc',
        event_type: 'tax_free_cash',
        pot_ref: sandbox.dc_pots[0]!.name,
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 25000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const next = applySandboxStrategySettingsToCurrentPlan(current, sandbox);

    expect(next.drawdown_strategy).toBe(sandbox.drawdown_strategy);
    expect(next.drawdown_strategy_params).toEqual(sandbox.drawdown_strategy_params);
    expect(next.target_income).toEqual(sandbox.target_income);
    expect(next.withdrawal_priority).toEqual(sandbox.withdrawal_priority);
    expect(next.drawdown_stages).toEqual(sandbox.drawdown_stages);
    expect(next.pension_access_events).toEqual(sandbox.pension_access_events);

    expect(next.dc_pots[0]!.starting_balance).toBe(250000);
    expect(next.dc_pots[0]!.growth_rate).toBe(0.03);
    expect(next.tax.personal_allowance).toBe(17000);
    expect(next.guaranteed_income[0]!.gross_annual).toBe(12000);
    expect(next.personal.retirement_date).toBe('2035-04');
  });

  it('removes current pension-access events when the sandbox has none', () => {
    const current = cloneConfig();
    const sandbox = cloneConfig();

    current.pension_access_events = [
      {
        id: 'current_tfc',
        event_type: 'tax_free_cash',
        pot_ref: current.dc_pots[0]!.name,
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 10000 },
        destination: { kind: 'outside_plan' },
      },
    ];
    delete sandbox.pension_access_events;

    const next = applySandboxStrategySettingsToCurrentPlan(current, sandbox);

    expect(next.pension_access_events).toBeUndefined();
  });
});
